#!/bin/bash
# Railway 등 클라우드 환경에서 PORT 환경변수를 uvicorn에 전달
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
