// Where things are in the inbox, for links from notifications, the MCP tools and the pages alike.
export const formPath = (form: string): string => `/forms/${encodeURIComponent(form)}`;
export const submissionsPath = (form: string): string => `${formPath(form)}/submissions`;
export const submissionPath = (form: string, id: string): string => `${submissionsPath(form)}/${encodeURIComponent(id)}`;
