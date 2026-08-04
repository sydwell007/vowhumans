import { VowHumansClient } from "@vowhumans/sdk";

const client = new VowHumansClient({
  baseUrl: process.env.VOWHUMANS_API_URL!,
  apiKey: process.env.VOWHUMANS_SERVICE_API_KEY!,
});

const session = await client.createInterviewPracticeSession({
  candidateReference: "candidate-owned-opaque-reference",
  digitalHumanId: "thandi-mokoena",
  mode: "guided",
  jobContext: "Trusted server-side job context",
  transcriptConsent: true,
});

console.log(session.id, session.candidateFeedbackUrl);

