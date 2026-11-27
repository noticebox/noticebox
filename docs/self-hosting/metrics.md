# Metrics

`/metrics` gives your monitoring (Prometheus, VictoriaMetrics, Grafana Agent) what is open and how long it has waited, in the Prometheus text format. It's how an instance with monitoring gets reminded of a submission nobody looked at: an alert on the oldest open submission's age catches a lost push from any cause.

It holds counts, ages and names only (box, form, state, target type), never a field, an id, a link or an address.

## Turning it on

Set `NOTICEBOX_METRICS_TOKEN` to 32 or more random characters:

```sh
openssl rand -hex 32
```

Without it, `/metrics` answers 404. With it, a request needs `Authorization: Bearer <token>`, and anything else gets 401. A signed-in session doesn't count. Keep the token in the environment of both noticebox and the scraper.

## What it says

| Series | Type | What |
|---|---|---|
| `noticebox_submissions_open{box, form, state}` | gauge | Submissions that aren't closed yet |
| `noticebox_submission_oldest_open_seconds{box, form}` | gauge | How long the oldest open submission of a form has waited; 0 when none is open. Every form has one |
| `noticebox_submissions_received_total{form, test}` | counter | Submissions received; `test="true"` for [test posts](notifications.md#test-posts) |
| `noticebox_notify_failures_total{form, target_type}` | counter | Announcements that failed (`ntfy`, `webhook`, `mail`), the ones the log names |

The gauges are read from the database at each scrape. The counters count from the start of the process, so they start at 0 again after a restart; `rate()` and `increase()` handle that.

## Scraping

Prometheus or vmagent, with the token in a file:

```yaml
scrape_configs:
  - job_name: noticebox
    scheme: https
    metrics_path: /metrics
    authorization:
      credentials_file: /etc/prometheus/noticebox-token
    static_configs:
      - targets: ["noticebox.example.org"]
```

## An alert

A submission that has waited a day:

```yaml
groups:
  - name: noticebox
    rules:
      - alert: NoticeboxSubmissionWaiting
        expr: max by (form) (noticebox_submission_oldest_open_seconds) > 24 * 3600
        labels:
          severity: warning
        annotations:
          summary: "A submission to {{ $labels.form }} has been open for more than a day"
      - alert: NoticeboxNotifyFailing
        expr: increase(noticebox_notify_failures_total[1h]) > 0
        annotations:
          summary: "Announcements for {{ $labels.form }} ({{ $labels.target_type }}) are failing"
```
