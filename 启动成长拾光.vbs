Option Explicit
Dim shell, files, project, python, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
project = files.GetParentFolderName(WScript.ScriptFullName)
python = "C:\Program Files\Python39\python.exe"
If Not files.FileExists(python) Then
  MsgBox "Python was not found: " & python, 16, "Baby Growth"
  WScript.Quit 1
End If
shell.CurrentDirectory = project
command = Chr(34) & python & Chr(34) & " " & Chr(34) & files.BuildPath(project, "local-server.py") & Chr(34)
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "--no-browser" Then command = command & " --no-browser"
End If
result = shell.Run(command, 0, True)
Set shell = Nothing
WScript.Quit result
