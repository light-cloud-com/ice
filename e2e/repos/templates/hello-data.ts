/** Minimal data pipeline script — for BigQuery / Pub/Sub testing */
export function helloDataFiles(): Array<{ path: string; content: string }> {
  return [
    {
      path: 'main.py',
      content: `"""ICE test data pipeline — reads env and prints structured output."""
import os, json, sys

def main():
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "unknown")
    print(json.dumps({
        "status": "ok",
        "service": "ice-test-hello-data",
        "project": project,
        "message": "Data pipeline executed successfully"
    }))
    sys.exit(0)

if __name__ == "__main__":
    main()
`,
    },
    {
      path: 'requirements.txt',
      content: `google-cloud-bigquery==3.31.0
google-cloud-pubsub==2.29.0
`,
    },
    {
      path: 'Dockerfile',
      content: `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py"]
`,
    },
  ];
}
