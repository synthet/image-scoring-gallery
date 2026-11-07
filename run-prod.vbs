' Starts the built app with no console window. For debug mode use run-debug.bat.
Option Explicit

Dim shell, fso, root
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

If Not (fso.FileExists(root & "\dist\index.html") And fso.FileExists(root & "\dist-electron\main.js")) Then
    If shell.Run("cmd /c npm run build:app", 1, True) <> 0 Then
        MsgBox "Build failed. Run npm run build:app in " & root & " to see why.", vbCritical, "Driftara Gallery"
        WScript.Quit 1
    End If
End If

shell.Environment("Process")("ELECTRON_IS_DEV") = "0"
shell.Run """" & root & "\node_modules\electron\dist\electron.exe"" .", 1, False
