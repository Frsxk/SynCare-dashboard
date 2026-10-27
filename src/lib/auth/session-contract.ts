export interface NurseSession {
  token: string;
  csrfToken: string;
  principal: { id: string; role: "nurse"; displayName: string; capabilities?: readonly string[] };
}

