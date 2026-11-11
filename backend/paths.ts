// Where things are in the inbox, for links from notifications, the MCP tools and the pages alike.
export const boxPath = (box: string): string => `/boxes/${encodeURIComponent(box)}`;
export const endpointPath = (form: string): string => `/f/${encodeURIComponent(form)}`;
export const formPath = (form: string): string => `/forms/${encodeURIComponent(form)}`;
export const submissionsPath = (form: string): string => `${formPath(form)}/submissions`;
export const submissionPath = (form: string, id: string): string => `${submissionsPath(form)}/${encodeURIComponent(id)}`;
/** The same submission on a page of its own, without the table beside it. */
export const casePath = (form: string, id: string): string => `${formPath(form)}/case/${encodeURIComponent(id)}`;
