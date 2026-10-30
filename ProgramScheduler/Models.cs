using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;

namespace ProgramScheduler;

/// <summary>スケジュール内のプログラムの実行方式</summary>
public enum ExecutionMode
{
    /// <summary>全プログラムを同時に起動する</summary>
    Parallel,
    /// <summary>上から順に、前のプログラムの終了を待って起動する</summary>
    Sequential,
}

/// <summary>実行状態</summary>
public enum RunStatus
{
    None,
    Waiting,
    Running,
    Success,
    Failed,
    Skipped,
    Canceled,
}

public abstract class ObservableObject : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    protected bool SetField<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }
}

/// <summary>1 つのスケジュール (起動時刻・曜日・実行方式と、実行するプログラム群)</summary>
public class ScheduleGroup : ObservableObject
{
    private bool _enabled = true;
    private string _name = "新しいスケジュール";
    private string _time = "09:00";
    private ExecutionMode _mode = ExecutionMode.Sequential;
    private bool _stopOnError = true;
    private bool _mon = true, _tue = true, _wed = true, _thu = true, _fri = true, _sat, _sun;
    private DateTime? _lastRun;
    private DateTime? _nextRun;
    private RunStatus _status;

    public bool Enabled { get => _enabled; set { if (SetField(ref _enabled, value)) UpdateNextRun(); } }
    public string Name { get => _name; set => SetField(ref _name, value); }

    /// <summary>起動時刻 (HH:mm)</summary>
    public string Time { get => _time; set { if (SetField(ref _time, value)) UpdateNextRun(); } }

    public ExecutionMode Mode { get => _mode; set => SetField(ref _mode, value); }

    /// <summary>順次実行時、失敗したら以降のプログラムを実行しない</summary>
    public bool StopOnError { get => _stopOnError; set => SetField(ref _stopOnError, value); }

    public bool Mon { get => _mon; set { if (SetField(ref _mon, value)) UpdateNextRun(); } }
    public bool Tue { get => _tue; set { if (SetField(ref _tue, value)) UpdateNextRun(); } }
    public bool Wed { get => _wed; set { if (SetField(ref _wed, value)) UpdateNextRun(); } }
    public bool Thu { get => _thu; set { if (SetField(ref _thu, value)) UpdateNextRun(); } }
    public bool Fri { get => _fri; set { if (SetField(ref _fri, value)) UpdateNextRun(); } }
    public bool Sat { get => _sat; set { if (SetField(ref _sat, value)) UpdateNextRun(); } }
    public bool Sun { get => _sun; set { if (SetField(ref _sun, value)) UpdateNextRun(); } }

    public BindingList<ProgramItem> Programs { get; set; } = new();

    public DateTime? LastRun { get => _lastRun; set => SetField(ref _lastRun, value); }

    [JsonIgnore]
    public DateTime? NextRun { get => _nextRun; private set => SetField(ref _nextRun, value); }

    [JsonIgnore]
    public RunStatus Status { get => _status; set => SetField(ref _status, value); }

    public bool IsDayEnabled(DayOfWeek day) => day switch
    {
        DayOfWeek.Monday => Mon,
        DayOfWeek.Tuesday => Tue,
        DayOfWeek.Wednesday => Wed,
        DayOfWeek.Thursday => Thu,
        DayOfWeek.Friday => Fri,
        DayOfWeek.Saturday => Sat,
        _ => Sun,
    };

    public static bool TryParseTime(string? text, out TimeSpan time)
    {
        time = default;
        return text != null
            && TimeSpan.TryParseExact(text.Trim(), new[] { @"h\:mm", @"hh\:mm", @"h\:mm\:ss", @"hh\:mm\:ss" }, null, out time)
            && time < TimeSpan.FromDays(1);
    }

    /// <summary>from より後で最初に到来する実行日時を求める (該当なしは null)</summary>
    public DateTime? GetNextRun(DateTime from)
    {
        if (!Enabled || !TryParseTime(Time, out var time)) return null;
        for (int d = 0; d <= 7; d++)
        {
            var candidate = from.Date.AddDays(d) + time;
            if (candidate > from && IsDayEnabled(candidate.DayOfWeek)) return candidate;
        }
        return null;
    }

    public void UpdateNextRun() => UpdateNextRun(DateTime.Now);

    public void UpdateNextRun(DateTime from) => NextRun = GetNextRun(from);
}

/// <summary>スケジュールから起動される 1 つのプログラム</summary>
public class ProgramItem : ObservableObject
{
    private bool _enabled = true;
    private string _name = "";
    private string _path = "";
    private string _arguments = "";
    private string _workingDirectory = "";
    private int _timeoutSeconds;
    private int? _lastExitCode;
    private RunStatus _status;
    private string _message = "";

    public bool Enabled { get => _enabled; set => SetField(ref _enabled, value); }
    public string Name { get => _name; set => SetField(ref _name, value); }
    public string Path { get => _path; set => SetField(ref _path, value); }
    public string Arguments { get => _arguments; set => SetField(ref _arguments, value); }
    public string WorkingDirectory { get => _workingDirectory; set => SetField(ref _workingDirectory, value); }

    /// <summary>この秒数を超えたら強制終了する (0 = 無制限)</summary>
    public int TimeoutSeconds { get => _timeoutSeconds; set => SetField(ref _timeoutSeconds, Math.Max(0, value)); }

    public int? LastExitCode { get => _lastExitCode; set => SetField(ref _lastExitCode, value); }

    [JsonIgnore]
    public RunStatus Status { get => _status; set => SetField(ref _status, value); }

    [JsonIgnore]
    public string Message { get => _message; set => SetField(ref _message, value); }
}
