export type PracticeMode = "realistic" | "guided" | "quick" | "confidence";

export class VowHumansClient {
  constructor(private readonly options: { baseUrl: string; apiKey: string }) {
    if (typeof window !== "undefined") throw new Error("VowHumans service SDK must run server-side");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/api/v1${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-api-key": this.options.apiKey, ...init?.headers },
    });
    if (!response.ok) throw new Error(`VowHumans API ${response.status}`);
    return response.json() as Promise<T>;
  }

  createInterviewPracticeSession(input: { candidateReference: string; digitalHumanId: string; mode: PracticeMode; jobContext: string; transcriptConsent: boolean }) {
    return this.request<{ id: string; roomToken?: string; candidateFeedbackUrl: string }>("/sessions/interview-practice", { method: "POST", body: JSON.stringify(input) });
  }
  completeSession(id: string) { return this.request(`/sessions/${id}/complete`, { method: "POST" }); }
  deleteSession(id: string) { return this.request(`/sessions/${id}`, { method: "DELETE" }); }
  getUsage() { return this.request<{ sessions: number; minutes: number }>("/usage"); }
}

