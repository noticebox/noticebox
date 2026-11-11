// Sign-in mail: a code, and a link to sign in with when there may be one (accounts.ts decides), through
// NOTICEBOX_SMTP_URL. Logs neither the address nor the code. Tests pass a Mailer of their own instead of SMTP.

export type Smtp = { url: string; from: string };
export type Mailer = (to: string, code: string, link: string | undefined) => Promise<void>;

// An SMTP server that never answers (a blocked port) fails the sign-in within these, logged, instead of hanging it.
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

export function smtpMailer(smtp: Smtp, log: (line: string) => void): Mailer {
  return async (to, code, link) => {
    const text = [
      `Your sign-in code for noticebox: ${code}`,
      "",
      link ? `Or open this link to sign in:\n${link}\n` : "Type it into the sign-in page that asked for it.\n",
      "It works once, for a few minutes. If you didn't ask for it, ignore this mail.",
    ].join("\n");
    try {
      const { createTransport } = await import("nodemailer");
      await createTransport({ url: smtp.url, ...TIMEOUTS }).sendMail({ from: smtp.from, to, subject: `${code} is your noticebox sign-in code`, text });
    } catch (e) {
      // The error may name the address: only its code is logged.
      log(`mail: sending a sign-in code failed (${(e as NodeJS.ErrnoException).code ?? "unknown"})`);
      throw e;
    }
  };
}
