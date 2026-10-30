using System.ComponentModel;
using System.Diagnostics;

namespace ProgramScheduler;

/// <summary>
/// 時刻を監視し、スケジュールに従ってプログラムを起動する。
/// UI スレッド上の WinForms Timer と async/await で動くため、モデルの更新は常に UI スレッドで行われる。
/// </summary>
public sealed class SchedulerEngine : IDisposable
{
    private readonly BindingList<ScheduleGroup> _groups;
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1000 };
    private readonly Dictionary<ScheduleGroup, CancellationTokenSource> _running = new();

    public event Action<string>? Log;

    public SchedulerEngine(BindingList<ScheduleGroup> groups)
    {
        _groups = groups;
        _timer.Tick += (_, _) => Tick();
    }

    public bool IsActive => _timer.Enabled;

    public void Start()
    {
        foreach (var g in _groups) g.UpdateNextRun();
        _timer.Start();
        WriteLog("スケジューラを開始しました");
    }

    public void Stop()
    {
        _timer.Stop();
        WriteLog("スケジューラを停止しました (実行中のプログラムはそのまま継続します)");
    }

    public bool IsRunning(ScheduleGroup group) => _running.ContainsKey(group);

    private void Tick()
    {
        var now = DateTime.Now;
        foreach (var group in _groups.ToList())
        {
            if (group.NextRun is not { } next || now < next) continue;

            group.UpdateNextRun(now);
            if (IsRunning(group))
            {
                WriteLog($"[{group.Name}] 前回の実行が終わっていないため今回の起動をスキップしました");
                continue;
            }
            _ = RunGroupAsync(group);
        }
    }

    /// <summary>スケジュールを実行する (手動実行からも呼ばれる)</summary>
    public async Task RunGroupAsync(ScheduleGroup group)
    {
        if (IsRunning(group)) return;

        var cts = new CancellationTokenSource();
        _running[group] = cts;
        var targets = group.Programs.Where(p => p.Enabled).ToList();

        foreach (var p in group.Programs)
        {
            p.Status = p.Enabled ? RunStatus.Waiting : RunStatus.None;
            p.Message = "";
        }
        group.Status = RunStatus.Running;
        group.LastRun = DateTime.Now;
        WriteLog($"[{group.Name}] 開始 ({(group.Mode == ExecutionMode.Parallel ? "並列" : "順次")}実行, {targets.Count} 件)");

        try
        {
            bool allOk;
            if (group.Mode == ExecutionMode.Parallel)
            {
                var results = await Task.WhenAll(targets.Select(p => RunProgramAsync(group, p, cts.Token)));
                allOk = results.All(ok => ok);
            }
            else
            {
                allOk = true;
                foreach (var p in targets)
                {
                    if (cts.IsCancellationRequested)
                    {
                        p.Status = RunStatus.Canceled;
                        continue;
                    }
                    if (!allOk && group.StopOnError)
                    {
                        p.Status = RunStatus.Skipped;
                        p.Message = "前のプログラムが失敗したため未実行";
                        continue;
                    }
                    if (!await RunProgramAsync(group, p, cts.Token)) allOk = false;
                }
            }

            group.Status = cts.IsCancellationRequested ? RunStatus.Canceled
                : allOk ? RunStatus.Success : RunStatus.Failed;
            WriteLog($"[{group.Name}] 終了: {StatusText(group.Status)}");
        }
        finally
        {
            _running.Remove(group);
            cts.Dispose();
        }
    }

    /// <summary>実行中のスケジュールを中止し、起動中のプログラムを終了させる</summary>
    public void Cancel(ScheduleGroup group)
    {
        if (_running.TryGetValue(group, out var cts))
        {
            WriteLog($"[{group.Name}] 中止を要求しました");
            cts.Cancel();
        }
    }

    private async Task<bool> RunProgramAsync(ScheduleGroup group, ProgramItem item, CancellationToken cancel)
    {
        var label = $"[{group.Name}] {(string.IsNullOrWhiteSpace(item.Name) ? item.Path : item.Name)}";
        if (string.IsNullOrWhiteSpace(item.Path))
        {
            item.Status = RunStatus.Failed;
            item.Message = "パスが未指定です";
            WriteLog($"{label}: パスが未指定です");
            return false;
        }

        var psi = new ProcessStartInfo
        {
            FileName = item.Path,
            Arguments = item.Arguments ?? "",
            // .bat やショートカット、関連付けられたファイルも起動できるようにシェル経由で起動する
            UseShellExecute = true,
        };
        if (!string.IsNullOrWhiteSpace(item.WorkingDirectory))
            psi.WorkingDirectory = item.WorkingDirectory;
        else if (System.IO.Path.GetDirectoryName(item.Path) is { Length: > 0 } dir)
            psi.WorkingDirectory = dir;

        item.Status = RunStatus.Running;
        item.Message = $"{DateTime.Now:HH:mm:ss} 起動";
        var sw = Stopwatch.StartNew();

        Process? process;
        try
        {
            process = Process.Start(psi);
        }
        catch (Exception ex)
        {
            item.Status = RunStatus.Failed;
            item.Message = ex.Message;
            WriteLog($"{label}: 起動失敗 - {ex.Message}");
            return false;
        }

        WriteLog($"{label}: 起動しました");
        if (process == null)
        {
            // 既存プロセスに処理が渡された場合など、終了を追跡できないケース
            item.Status = RunStatus.Success;
            item.Message = "起動しました (終了は追跡できません)";
            return true;
        }

        using (process)
        using (var timeout = item.TimeoutSeconds > 0
                   ? new CancellationTokenSource(TimeSpan.FromSeconds(item.TimeoutSeconds))
                   : new CancellationTokenSource())
        using (var linked = CancellationTokenSource.CreateLinkedTokenSource(cancel, timeout.Token))
        {
            try
            {
                await process.WaitForExitAsync(linked.Token);
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch { /* 既に終了している */ }
                var timedOut = timeout.IsCancellationRequested && !cancel.IsCancellationRequested;
                item.Status = timedOut ? RunStatus.Failed : RunStatus.Canceled;
                item.Message = timedOut ? $"タイムアウト ({item.TimeoutSeconds} 秒) により強制終了" : "中止により強制終了";
                WriteLog($"{label}: {item.Message}");
                return false;
            }

            item.LastExitCode = process.ExitCode;
            item.Status = process.ExitCode == 0 ? RunStatus.Success : RunStatus.Failed;
            item.Message = $"終了コード {process.ExitCode} / {sw.Elapsed:hh\\:mm\\:ss}";
            WriteLog($"{label}: {item.Message}");
            return process.ExitCode == 0;
        }
    }

    public static string StatusText(RunStatus status) => status switch
    {
        RunStatus.Waiting => "待機中",
        RunStatus.Running => "実行中",
        RunStatus.Success => "成功",
        RunStatus.Failed => "失敗",
        RunStatus.Skipped => "スキップ",
        RunStatus.Canceled => "中止",
        _ => "",
    };

    private void WriteLog(string message) => Log?.Invoke(message);

    public void Dispose()
    {
        _timer.Dispose();
    }
}
