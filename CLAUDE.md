# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`ProgramScheduler/` — a Windows Forms (.NET 8, `net8.0-windows`) app that launches programs at scheduled times, either in parallel or sequentially. Standard library only (no NuGet packages). User-facing text and docs are in Japanese.

## Commands

- Build / run (Windows): `cd ProgramScheduler && dotnet build` / `dotnet run`
- There are no tests.
- On Linux the distro .NET SDK lacks the WindowsDesktop SDK, so `dotnet build` fails there. To compile-check, build a throwaway net8.0 library project that includes `ProgramScheduler/*.cs` and references the `Microsoft.WindowsDesktop.App.Ref` package's ref assemblies (`PackageDownload` + `Reference`), with global usings for `System.Drawing` and `System.Windows.Forms`.

## Architecture

- `Models.cs`: `ScheduleGroup` (time, weekdays, `ExecutionMode`, `Programs` as `BindingList<ProgramItem>`) and `ProgramItem`. Both implement `INotifyPropertyChanged` so `DataGridView` rows refresh automatically. Runtime-only properties (`Status`, `NextRun`, `Message`) are `[JsonIgnore]`.
- `SchedulerEngine.cs`: polls every second with a WinForms `Timer` and runs groups with `async/await` on the UI thread — model mutations therefore always happen on the UI thread; keep it that way (no `Task.Run` touching models).
- `MainForm.cs`: UI built in code (no designer files). Persists to `schedules.json` next to the exe; logs to `logs/`.
