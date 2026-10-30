using System.ComponentModel;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProgramScheduler;

public sealed class MainForm : Form
{
    private static readonly string DataFile = Path.Combine(AppContext.BaseDirectory, "schedules.json");
    private static readonly string LogDir = Path.Combine(AppContext.BaseDirectory, "logs");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private sealed record ModeOption(string Text, ExecutionMode Value);

    private readonly BindingList<ScheduleGroup> _groups;
    private readonly SchedulerEngine _engine;

    private readonly DataGridView _scheduleGrid = CreateGrid();
    private readonly DataGridView _programGrid = CreateGrid();
    private readonly TextBox _logBox = new()
    {
        Dock = DockStyle.Fill,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Vertical,
        BackColor = SystemColors.Window,
        Font = new Font("Consolas", 9f),
    };
    private readonly ToolStripButton _startStopButton = new() { DisplayStyle = ToolStripItemDisplayStyle.Text };
    private readonly ToolStripLabel _clockLabel = new() { Alignment = ToolStripItemAlignment.Right };
    private readonly Label _programTitle = new() { AutoSize = true, Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold), Padding = new Padding(0, 6, 0, 0) };
    private readonly NotifyIcon _trayIcon = new() { Text = "プログラムスケジューラ", Icon = SystemIcons.Application };
    private readonly System.Windows.Forms.Timer _clockTimer = new() { Interval = 1000 };
    private readonly List<Button> _programButtons = new();
    private bool _dirty;

    private ScheduleGroup? SelectedGroup => _scheduleGrid.CurrentRow?.DataBoundItem as ScheduleGroup;
    private ProgramItem? SelectedProgram => _programGrid.CurrentRow?.DataBoundItem as ProgramItem;

    public MainForm()
    {
        Text = "プログラムスケジューラ";
        Size = new Size(1280, 820);
        MinimumSize = new Size(900, 600);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Yu Gothic UI", 9f);

        _groups = LoadGroups();
        _engine = new SchedulerEngine(_groups);
        _engine.Log += AppendLog;

        BuildLayout();
        BuildScheduleColumns();
        BuildProgramColumns();

        _scheduleGrid.DataSource = _groups;
        _scheduleGrid.SelectionChanged += (_, _) => ShowProgramsOfSelectedGroup();
        _groups.ListChanged += (_, e) =>
        {
            if (e.ListChangedType != ListChangedType.ItemChanged || IsPersistentProperty(e.PropertyDescriptor?.Name))
                _dirty = true;
        };

        _trayIcon.DoubleClick += (_, _) => RestoreFromTray();
        _trayIcon.ContextMenuStrip = new ContextMenuStrip();
        _trayIcon.ContextMenuStrip.Items.Add("表示", null, (_, _) => RestoreFromTray());
        _trayIcon.ContextMenuStrip.Items.Add("終了", null, (_, _) => Close());

        _clockTimer.Tick += (_, _) => _clockLabel.Text = DateTime.Now.ToString("yyyy/MM/dd (ddd) HH:mm:ss");
        _clockTimer.Start();

        Load += (_, _) =>
        {
            _engine.Start();
            UpdateStartStopButton();
            ShowProgramsOfSelectedGroup();
        };
        Resize += (_, _) =>
        {
            if (WindowState == FormWindowState.Minimized)
            {
                Hide();
                _trayIcon.Visible = true;
                _trayIcon.ShowBalloonTip(2000, "プログラムスケジューラ", "タスクトレイで動作中です", ToolTipIcon.Info);
            }
        };
    }

    // ------------------------------------------------------------------ レイアウト

    private void BuildLayout()
    {
        var toolStrip = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(4) };
        _startStopButton.Click += (_, _) =>
        {
            if (_engine.IsActive) _engine.Stop(); else _engine.Start();
            UpdateStartStopButton();
        };
        toolStrip.Items.Add(_startStopButton);
        toolStrip.Items.Add(new ToolStripSeparator());
        toolStrip.Items.Add(new ToolStripButton("保存", null, (_, _) => SaveGroups()) { DisplayStyle = ToolStripItemDisplayStyle.Text });
        toolStrip.Items.Add(new ToolStripButton("データフォルダを開く", null, (_, _) => OpenFolder(AppContext.BaseDirectory)) { DisplayStyle = ToolStripItemDisplayStyle.Text });
        toolStrip.Items.Add(_clockLabel);

        // 上: スケジュール一覧
        var schedulePanel = CreateSection(
            new Label { Text = "スケジュール一覧", AutoSize = true, Font = new Font(Font, FontStyle.Bold), Padding = new Padding(0, 6, 0, 0) },
            _scheduleGrid,
            Button("追加", (_, _) => AddGroup()),
            Button("削除", (_, _) => RemoveGroup()),
            Button("複製", (_, _) => DuplicateGroup()),
            Button("▶ 今すぐ実行", async (_, _) => { if (SelectedGroup is { } g) await _engine.RunGroupAsync(g); }),
            Button("■ 中止", (_, _) => { if (SelectedGroup is { } g) _engine.Cancel(g); }));

        // 中: 選択中スケジュールのプログラム一覧
        _programButtons.AddRange(new[]
        {
            Button("追加", (_, _) => AddProgram()),
            Button("削除", (_, _) => RemoveProgram()),
            Button("▲ 上へ", (_, _) => MoveProgram(-1)),
            Button("▼ 下へ", (_, _) => MoveProgram(+1)),
        });
        var programPanel = CreateSection(_programTitle, _programGrid, _programButtons.ToArray());

        // 下: ログ
        var logPanel = new GroupBox { Text = "実行ログ", Dock = DockStyle.Fill, Padding = new Padding(6) };
        logPanel.Controls.Add(_logBox);

        var lower = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterWidth = 6 };
        lower.Panel1.Controls.Add(programPanel);
        lower.Panel2.Controls.Add(logPanel);

        var main = new SplitContainer { Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, SplitterWidth = 6 };
        main.Panel1.Controls.Add(schedulePanel);
        main.Panel2.Controls.Add(lower);

        Controls.Add(main);
        Controls.Add(toolStrip);

        Shown += (_, _) =>
        {
            main.SplitterDistance = (int)(main.Height * 0.38);
            lower.SplitterDistance = (int)(lower.Height * 0.62);
        };
    }

    private static Control CreateSection(Control title, DataGridView grid, params Button[] buttons)
    {
        var header = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, WrapContents = false, Padding = new Padding(0, 2, 0, 2) };
        header.Controls.Add(title);
        header.Controls.Add(new Label { Width = 16 });
        header.Controls.AddRange(buttons);

        var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(6) };
        panel.Controls.Add(grid);
        panel.Controls.Add(header);
        return panel;
    }

    private static Button Button(string text, EventHandler onClick)
    {
        var b = new Button { Text = text, AutoSize = true, Margin = new Padding(2, 0, 2, 0) };
        b.Click += onClick;
        return b;
    }

    private static DataGridView CreateGrid()
    {
        var grid = new DataGridView
        {
            Dock = DockStyle.Fill,
            AutoGenerateColumns = false,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            AllowUserToResizeRows = false,
            MultiSelect = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            RowHeadersWidth = 24,
            BackgroundColor = SystemColors.Window,
            EditMode = DataGridViewEditMode.EditOnKeystrokeOrF2,
            ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize,
        };
        grid.AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(246, 248, 252);
        grid.ColumnHeadersDefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(225, 232, 245);
        // チェックボックスやコンボボックスの変更を即座に反映する
        grid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (grid.IsCurrentCellDirty && grid.CurrentCell is DataGridViewCheckBoxCell or DataGridViewComboBoxCell)
                grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
        };
        grid.CellDoubleClick += (_, e) =>
        {
            if (e.RowIndex >= 0 && e.ColumnIndex >= 0 && !grid.Columns[e.ColumnIndex].ReadOnly) grid.BeginEdit(true);
        };
        grid.DataError += (_, e) =>
        {
            MessageBox.Show("入力値が正しくありません。", "入力エラー", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            e.Cancel = true;
        };
        return grid;
    }

    private static DataGridViewTextBoxColumn TextColumn(string property, string header, int width, bool readOnly = false, bool fill = false)
    {
        var col = new DataGridViewTextBoxColumn
        {
            DataPropertyName = property,
            Name = property,
            HeaderText = header,
            Width = width,
            ReadOnly = readOnly,
        };
        if (fill)
        {
            col.AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
            col.MinimumWidth = width;
        }
        if (readOnly) col.DefaultCellStyle.ForeColor = Color.DimGray;
        return col;
    }

    private static DataGridViewCheckBoxColumn CheckColumn(string property, string header, int width) => new()
    {
        DataPropertyName = property,
        Name = property,
        HeaderText = header,
        Width = width,
    };

    private void BuildScheduleColumns()
    {
        var g = _scheduleGrid;
        g.Columns.Add(CheckColumn(nameof(ScheduleGroup.Enabled), "有効", 44));
        g.Columns.Add(TextColumn(nameof(ScheduleGroup.Name), "スケジュール名", 180, fill: true));
        var time = TextColumn(nameof(ScheduleGroup.Time), "起動時刻", 70);
        time.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
        time.ToolTipText = "HH:mm 形式 (例 09:30)";
        g.Columns.Add(time);

        g.Columns.Add(new DataGridViewComboBoxColumn
        {
            DataPropertyName = nameof(ScheduleGroup.Mode),
            Name = nameof(ScheduleGroup.Mode),
            HeaderText = "実行方式",
            Width = 80,
            DataSource = new[] { new ModeOption("順番に", ExecutionMode.Sequential), new ModeOption("同時に", ExecutionMode.Parallel) },
            DisplayMember = nameof(ModeOption.Text),
            ValueMember = nameof(ModeOption.Value),
            ValueType = typeof(ExecutionMode),
            DisplayStyle = DataGridViewComboBoxDisplayStyle.ComboBox,
            FlatStyle = FlatStyle.Flat,
        });
        var stop = CheckColumn(nameof(ScheduleGroup.StopOnError), "失敗時\n中断", 52);
        stop.ToolTipText = "順番に実行する場合、失敗したら以降のプログラムを実行しない";
        g.Columns.Add(stop);

        foreach (var (prop, text) in new[] { ("Mon", "月"), ("Tue", "火"), ("Wed", "水"), ("Thu", "木"), ("Fri", "金"), ("Sat", "土"), ("Sun", "日") })
        {
            var col = CheckColumn(prop, text, 30);
            if (prop == "Sat") col.HeaderCell.Style.ForeColor = Color.Blue;
            if (prop == "Sun") col.HeaderCell.Style.ForeColor = Color.Red;
            g.Columns.Add(col);
        }

        g.Columns.Add(TextColumn(nameof(ScheduleGroup.NextRun), "次回実行", 150, readOnly: true));
        g.Columns.Add(TextColumn(nameof(ScheduleGroup.LastRun), "前回実行", 150, readOnly: true));
        g.Columns.Add(TextColumn(nameof(ScheduleGroup.Status), "状態", 70, readOnly: true));
        var count = TextColumn("ProgramCount", "件数", 44, readOnly: true);
        count.DataPropertyName = "";
        g.Columns.Add(count);

        g.CellFormatting += (_, e) =>
        {
            if (e.RowIndex < 0 || g.Rows[e.RowIndex].DataBoundItem is not ScheduleGroup item) return;
            switch (g.Columns[e.ColumnIndex].Name)
            {
                case nameof(ScheduleGroup.NextRun):
                    e.Value = item.NextRun?.ToString("yyyy/MM/dd (ddd) HH:mm") ?? (item.Enabled ? "曜日未選択" : "無効");
                    e.FormattingApplied = true;
                    break;
                case nameof(ScheduleGroup.LastRun):
                    e.Value = item.LastRun?.ToString("yyyy/MM/dd (ddd) HH:mm:ss") ?? "";
                    e.FormattingApplied = true;
                    break;
                case nameof(ScheduleGroup.Status):
                    FormatStatus(e, item.Status);
                    break;
                case "ProgramCount":
                    e.Value = item.Programs.Count;
                    e.CellStyle!.Alignment = DataGridViewContentAlignment.MiddleRight;
                    e.FormattingApplied = true;
                    break;
            }
            if (!item.Enabled) e.CellStyle!.ForeColor = Color.Gray;
        };
        g.CellValidating += (_, e) =>
        {
            if (g.Columns[e.ColumnIndex].Name != nameof(ScheduleGroup.Time) || !g.IsCurrentCellInEditMode) return;
            if (!ScheduleGroup.TryParseTime(e.FormattedValue?.ToString(), out TimeSpan _))
            {
                MessageBox.Show("起動時刻は HH:mm 形式 (例 09:30) で入力してください。", "入力エラー", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                e.Cancel = true;
            }
        };
        g.CellParsing += (_, e) =>
        {
            // 「9:5」のような入力も「09:05」に揃える
            if (g.Columns[e.ColumnIndex].Name == nameof(ScheduleGroup.Time)
                && ScheduleGroup.TryParseTime(e.Value?.ToString(), out var t))
            {
                e.Value = t.ToString(t.Seconds == 0 ? @"hh\:mm" : @"hh\:mm\:ss");
                e.ParsingApplied = true;
            }
        };
    }

    private void BuildProgramColumns()
    {
        var g = _programGrid;
        var order = TextColumn("Order", "順番", 44, readOnly: true);
        order.DataPropertyName = "";
        order.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
        g.Columns.Add(order);
        g.Columns.Add(CheckColumn(nameof(ProgramItem.Enabled), "有効", 44));
        g.Columns.Add(TextColumn(nameof(ProgramItem.Name), "名前", 140));
        g.Columns.Add(TextColumn(nameof(ProgramItem.Path), "プログラムのパス", 260, fill: true));
        g.Columns.Add(new DataGridViewButtonColumn { Name = "Browse", HeaderText = "", Text = "参照…", UseColumnTextForButtonValue = true, Width = 56 });
        g.Columns.Add(TextColumn(nameof(ProgramItem.Arguments), "引数", 140));
        g.Columns.Add(TextColumn(nameof(ProgramItem.WorkingDirectory), "作業フォルダ (空欄=exeの場所)", 160));
        var timeout = TextColumn(nameof(ProgramItem.TimeoutSeconds), "タイムアウト\n(秒, 0=なし)", 80);
        timeout.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
        g.Columns.Add(timeout);
        g.Columns.Add(TextColumn(nameof(ProgramItem.Status), "状態", 70, readOnly: true));
        var exit = TextColumn(nameof(ProgramItem.LastExitCode), "終了\nコード", 50, readOnly: true);
        exit.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
        g.Columns.Add(exit);
        g.Columns.Add(TextColumn(nameof(ProgramItem.Message), "詳細", 200, readOnly: true));

        g.CellFormatting += (_, e) =>
        {
            if (e.RowIndex < 0 || g.Rows[e.RowIndex].DataBoundItem is not ProgramItem item) return;
            switch (g.Columns[e.ColumnIndex].Name)
            {
                case "Order":
                    var parallel = SelectedGroup?.Mode == ExecutionMode.Parallel;
                    e.Value = parallel ? "同時" : (e.RowIndex + 1).ToString();
                    e.FormattingApplied = true;
                    break;
                case nameof(ProgramItem.Status):
                    FormatStatus(e, item.Status);
                    break;
            }
            if (!item.Enabled) e.CellStyle!.ForeColor = Color.Gray;
        };
        g.CellContentClick += (_, e) =>
        {
            if (e.RowIndex < 0 || g.Columns[e.ColumnIndex].Name != "Browse" || g.Rows[e.RowIndex].DataBoundItem is not ProgramItem item) return;
            BrowseProgram(item);
        };
    }

    private static void FormatStatus(DataGridViewCellFormattingEventArgs e, RunStatus status)
    {
        e.Value = SchedulerEngine.StatusText(status);
        e.FormattingApplied = true;
        e.CellStyle!.Alignment = DataGridViewContentAlignment.MiddleCenter;
        var back = status switch
        {
            RunStatus.Running => Color.FromArgb(255, 235, 150),
            RunStatus.Waiting => Color.FromArgb(225, 235, 255),
            RunStatus.Success => Color.FromArgb(200, 240, 200),
            RunStatus.Failed => Color.FromArgb(255, 200, 200),
            RunStatus.Skipped or RunStatus.Canceled => Color.FromArgb(225, 225, 225),
            _ => Color.Empty,
        };
        if (back != Color.Empty)
        {
            e.CellStyle!.BackColor = back;
            e.CellStyle!.SelectionBackColor = ControlPaint.Dark(back, 0.1f);
            e.CellStyle!.SelectionForeColor = Color.Black;
        }
    }

    // ------------------------------------------------------------------ 操作

    private void ShowProgramsOfSelectedGroup()
    {
        var group = SelectedGroup;
        if (group != null && ReferenceEquals(_programGrid.DataSource, group.Programs)) return;
        _programGrid.DataSource = group?.Programs;
        _programTitle.Text = group == null ? "プログラム一覧" : $"プログラム一覧 ―「{group.Name}」";
        foreach (var b in _programButtons) b.Enabled = group != null;
    }

    private void AddGroup()
    {
        var group = new ScheduleGroup();
        HookGroup(group);
        _groups.Add(group);
        group.UpdateNextRun();
        SelectRow(_scheduleGrid, _groups.Count - 1);
    }

    private void RemoveGroup()
    {
        if (SelectedGroup is not { } g) return;
        if (_engine.IsRunning(g))
        {
            MessageBox.Show("実行中のスケジュールは削除できません。先に中止してください。", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (MessageBox.Show($"スケジュール「{g.Name}」を削除しますか？", Text, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return;
        _groups.Remove(g);
        ShowProgramsOfSelectedGroup();
    }

    private void DuplicateGroup()
    {
        if (SelectedGroup is not { } g) return;
        var copy = JsonSerializer.Deserialize<ScheduleGroup>(JsonSerializer.Serialize(g, JsonOptions), JsonOptions)!;
        copy.Name += " のコピー";
        copy.LastRun = null;
        foreach (var p in copy.Programs) p.LastExitCode = null;
        HookGroup(copy);
        _groups.Insert(_groups.IndexOf(g) + 1, copy);
        copy.UpdateNextRun();
        SelectRow(_scheduleGrid, _groups.IndexOf(copy));
    }

    private void AddProgram()
    {
        if (SelectedGroup is not { } g) return;
        var item = new ProgramItem();
        if (!BrowseProgram(item)) return;
        g.Programs.Add(item);
        SelectRow(_programGrid, g.Programs.Count - 1);
    }

    private void RemoveProgram()
    {
        if (SelectedGroup is not { } g || SelectedProgram is not { } p) return;
        if (_engine.IsRunning(g))
        {
            MessageBox.Show("実行中のスケジュールのプログラムは削除できません。", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (MessageBox.Show($"「{(p.Name.Length > 0 ? p.Name : p.Path)}」を一覧から削除しますか？", Text, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return;
        g.Programs.Remove(p);
    }

    private void MoveProgram(int delta)
    {
        if (SelectedGroup is not { } g || SelectedProgram is not { } p) return;
        if (_engine.IsRunning(g)) return;
        var index = g.Programs.IndexOf(p);
        var newIndex = index + delta;
        if (newIndex < 0 || newIndex >= g.Programs.Count) return;
        g.Programs.RemoveAt(index);
        g.Programs.Insert(newIndex, p);
        SelectRow(_programGrid, newIndex);
    }

    private bool BrowseProgram(ProgramItem item)
    {
        using var dialog = new OpenFileDialog
        {
            Title = "実行するプログラムを選択",
            Filter = "実行ファイル (*.exe;*.bat;*.cmd;*.ps1;*.vbs)|*.exe;*.bat;*.cmd;*.ps1;*.vbs|すべてのファイル (*.*)|*.*",
        };
        if (File.Exists(item.Path)) dialog.FileName = item.Path;
        if (dialog.ShowDialog(this) != DialogResult.OK) return false;
        item.Path = dialog.FileName;
        if (string.IsNullOrWhiteSpace(item.Name)) item.Name = Path.GetFileNameWithoutExtension(dialog.FileName);
        return true;
    }

    private static void SelectRow(DataGridView grid, int index)
    {
        if (index < 0 || index >= grid.Rows.Count) return;
        grid.ClearSelection();
        grid.CurrentCell = grid.Rows[index].Cells.Cast<DataGridViewCell>().First(c => c.Visible);
        grid.Rows[index].Selected = true;
    }

    private void UpdateStartStopButton()
    {
        _startStopButton.Text = _engine.IsActive ? "■ スケジューラ停止" : "▶ スケジューラ開始";
        _startStopButton.ForeColor = _engine.IsActive ? Color.DarkRed : Color.DarkGreen;
        Text = "プログラムスケジューラ" + (_engine.IsActive ? " (稼働中)" : " (停止中)");
        _trayIcon.Text = Text;
    }

    private void RestoreFromTray()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        _trayIcon.Visible = false;
    }

    private static void OpenFolder(string path)
    {
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true }); }
        catch { /* フォルダを開けなくても動作に影響はない */ }
    }

    // ------------------------------------------------------------------ ログ

    private void AppendLog(string message)
    {
        var line = $"{DateTime.Now:yyyy/MM/dd HH:mm:ss}  {message}";
        if (_logBox.TextLength > 200_000) _logBox.Text = _logBox.Text[^100_000..];
        _logBox.AppendText(line + Environment.NewLine);
        try
        {
            Directory.CreateDirectory(LogDir);
            File.AppendAllText(Path.Combine(LogDir, $"{DateTime.Now:yyyyMMdd}.log"), line + Environment.NewLine, Encoding.UTF8);
        }
        catch (IOException) { /* ログファイルへの書き込み失敗は無視する */ }
    }

    // ------------------------------------------------------------------ 保存・読込

    private static readonly HashSet<string> RuntimeProperties = new()
    {
        nameof(ScheduleGroup.NextRun), nameof(ScheduleGroup.Status), nameof(ProgramItem.Message),
    };

    private static bool IsPersistentProperty(string? name) => name == null || !RuntimeProperties.Contains(name);

    private void HookGroup(ScheduleGroup group)
    {
        group.Programs.ListChanged += (_, e) =>
        {
            if (e.ListChangedType != ListChangedType.ItemChanged || IsPersistentProperty(e.PropertyDescriptor?.Name))
                _dirty = true;
            // 件数・順番の表示を更新する
            _scheduleGrid.Invalidate();
            if (e.ListChangedType != ListChangedType.ItemChanged) _programGrid.Invalidate();
        };
        group.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(ScheduleGroup.Mode)) _programGrid.Invalidate();
            if (e.PropertyName == nameof(ScheduleGroup.Name) && group == SelectedGroup)
                _programTitle.Text = $"プログラム一覧 ―「{group.Name}」";
        };
    }

    private BindingList<ScheduleGroup> LoadGroups()
    {
        BindingList<ScheduleGroup>? groups = null;
        try
        {
            if (File.Exists(DataFile))
                groups = JsonSerializer.Deserialize<BindingList<ScheduleGroup>>(File.ReadAllText(DataFile, Encoding.UTF8), JsonOptions);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"設定ファイルの読み込みに失敗しました。\n{DataFile}\n\n{ex.Message}", "読み込みエラー", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        groups ??= new BindingList<ScheduleGroup>();
        foreach (var g in groups) HookGroup(g);
        return groups;
    }

    private bool SaveGroups()
    {
        _scheduleGrid.EndEdit();
        _programGrid.EndEdit();
        try
        {
            var tmp = DataFile + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_groups, JsonOptions), Encoding.UTF8);
            File.Move(tmp, DataFile, overwrite: true);
            _dirty = false;
            AppendLog($"設定を保存しました ({DataFile})");
            return true;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"保存に失敗しました。\n{ex.Message}", "保存エラー", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_groups.Any(_engine.IsRunning)
            && MessageBox.Show("実行中のスケジュールがあります。\n終了すると、順番待ちのプログラムは実行されず、実行中のプログラムの結果も記録されません。\n終了しますか？",
                   Text, MessageBoxButtons.OKCancel, MessageBoxIcon.Warning) != DialogResult.OK)
        {
            e.Cancel = true;
            return;
        }
        if (_dirty)
        {
            var answer = MessageBox.Show("変更を保存しますか？", Text, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            if (answer == DialogResult.Cancel || (answer == DialogResult.Yes && !SaveGroups()))
            {
                e.Cancel = true;
                return;
            }
        }
        base.OnFormClosing(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _engine.Dispose();
            _clockTimer.Dispose();
            _trayIcon.Dispose();
        }
        base.Dispose(disposing);
    }
}
