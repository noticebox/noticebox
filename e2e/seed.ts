// The forms the e2e tests start with, created through the backend in a fresh database, the way an operator creates
// them in the inbox or over MCP. playwright.config.ts calls it before it starts the server, which loads them at start.
import { Store } from "../backend/db";
import { Forms } from "../backend/forms";

export const NTFY_URL = "http://127.0.0.1:3399/reports";

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
