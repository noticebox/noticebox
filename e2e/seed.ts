// The forms the e2e tests start with, created through the backend in a fresh database, the way an operator creates
// them in the inbox or over MCP. playwright.config.ts calls it before it starts the server, which loads them at start.
import { Store } from "../backend/db";
import { Forms } from "../backend/forms";

export const NTFY_URL = "http://127.0.0.1:3399/reports";

/** The person the tests are signed in as (global-setup.ts); events record them by this address. */
export const PERSON = "marcel@example.org";

/** The server's environment, which global-setup.ts reads too, so its sessions are signed with the server's secret. */
export const E2E_ENV: Record<string, string> = {
  NOTICEBOX_DB: ".e2e/e2e.sqlite",
  NOTICEBOX_BASE_URL: "http://localhost:3300",
  NOTICEBOX_SECRET: "4f0c9a7e2b61d8335e9a0c17b2f4d6e8a1c3b5d7f9e0a2c4b6d8f1e3a5c7b9d0",
  NOTICEBOX_ALLOWED_EMAILS: PERSON,
  // Sign-in by email is on, so the instance has a way in; the tests never send a mail.
  NOTICEBOX_SMTP_URL: "smtp://127.0.0.1:2525",
  NOTICEBOX_RATE_LIMIT: "0",
  PORT: "3300",
  NTFY_URL,
};

const FORMS = {
  forms: {
    report: {
      box: "notes.test",
      kind: "report",
      title: "Report content",
      intro: "Say what is wrong with this note.",
      fields: {
        read_id: {
          type: "hidden",
        },
        note_id: {
          type: "hidden",
        },
        file: {
          type: "text",
          label: "File",
          personal: false,
        },
        reason: {
          type: "select",
          label: "Reason",
          required: true,
          options: ["Illegal content", "Personal data", "Spam", "Other"],
        },
        text: {
          type: "textarea",
          label: "What is wrong",
          required: true,
          max: 2000,
        },
        email: {
          type: "email",
          label: "Your email",
          help: "Only to answer you.",
        },
      },
      retentionDays: 90,
      notify: {
        ntfy: "${NTFY_URL}",
      },
      link: {
        url: "https://notes.test/r/{read_id}/{note_id}",
        label: "Open the note",
      },
    },
    contact: {
      kind: "message",
      title: "Contact",
      fields: {
        name: {
          label: "Name",
          required: true,
        },
        email: {
          type: "email",
          label: "Email",
          required: true,
        },
        message: {
          type: "textarea",
          label: "Message",
          required: true,
        },
      },
      origins: ["https://example.org"],
      redirect: "https://example.org/thanks",
      retentionDays: 30,
    },
    order: {
      kind: "message",
      title: "Print order",
      fields: {
        name: { label: "Name", required: true },
        model: { type: "file", label: "Model", required: true, accept: [".stl", "image/*"], maxFiles: 2, maxMegabytes: 1 },
      },
      retentionDays: 30,
    },
  },
};

export function seed(dbPath: string): void {
  const store = new Store(dbPath);
  try {
    const r = new Forms(store, { NTFY_URL }, () => {}).replace(FORMS);
    if (!r.ok) throw new Error(`e2e forms: ${r.error}`);
  } finally {
    store.close();
  }
}
