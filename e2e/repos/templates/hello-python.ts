/** Minimal Flask API — for Cloud Run testing */
export function helloPythonFiles(): Array<{ path: string; content: string }> {
  return [
    {
      path: 'app.py',
      content: `import os
from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/")
def index():
    return jsonify(status="ok", service="ice-test-hello-python")

@app.route("/health")
def health():
    return "", 200

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
`,
    },
    {
      path: 'requirements.txt',
      content: `flask==3.1.0
gunicorn==23.0.0
`,
    },
    {
      path: 'Dockerfile',
      content: `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]
`,
    },
  ];
}
