import subprocess, sys
subprocess.run([
    sys.executable, "-m", "uvicorn", "main:app",
    "--host", "0.0.0.0",
    "--port", "8000",
    "--ssl-certfile", "certs/jarvis.crt",
    "--ssl-keyfile", "certs/jarvis.key"
], cwd=r"D:\AlanBabusFiles\Projects\JARVIS\backend")
