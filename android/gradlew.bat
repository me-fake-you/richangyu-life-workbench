@echo off
rem Gradle Wrapper bootstrap. Apache License, Version 2.0.
rem https://www.apache.org/licenses/LICENSE-2.0
setlocal
set "JAVA_EXE=java.exe"
if defined JAVA_HOME set "JAVA_EXE=%JAVA_HOME%\bin\java.exe"
"%JAVA_EXE%" -Xms64m -Xmx64m -classpath "%~dp0gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
exit /b %ERRORLEVEL%
