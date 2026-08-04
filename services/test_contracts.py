import unittest
from contracts import (
    AvatarMode,
    IdentityGate,
    effective_avatar_mode,
    employer_completion_payload,
    may_access_organisation,
    may_generate,
    may_read_candidate_transcript,
)

class SafetyContractTests(unittest.TestCase):
    def complete_gate(self, **changes):
        values = dict(owner=True,written=True,face=True,voice=True,commercial=True,roles=1,applications=1,geography=True,expiry=True,provenance=True,approved=True,revoked=False)
        values.update(changes)
        return IdentityGate(**values)

    def test_revoked_identity_cannot_render(self):
        self.assertFalse(may_generate(self.complete_gate(revoked=True)))

    def test_incomplete_consent_cannot_render(self):
        self.assertFalse(may_generate(self.complete_gate(voice=False)))

    def test_missing_gpu_falls_back_to_audio(self):
        self.assertEqual(effective_avatar_mode(AvatarMode.MUSETALK, worker_healthy=False, consent_valid=True), AvatarMode.AUDIO_ONLY)

    def test_invalid_consent_falls_back_to_audio(self):
        self.assertEqual(effective_avatar_mode(AvatarMode.STATIC, worker_healthy=True, consent_valid=False), AvatarMode.AUDIO_ONLY)

    def test_cross_organisation_access_is_denied(self):
        self.assertFalse(may_access_organisation("org_goalvow", "org_external"))

    def test_platform_admin_cross_organisation_access_is_explicit(self):
        self.assertTrue(may_access_organisation("org_platform", "org_goalvow", platform_admin=True))

    def test_employer_cannot_read_candidate_practice_transcript(self):
        self.assertFalse(may_read_candidate_transcript(requester_id="employer_01", candidate_id="candidate_01"))

    def test_completion_payload_excludes_private_candidate_content(self):
        payload = employer_completion_payload({
            "id": "session_01",
            "application_id": "plugconnect",
            "status": "completed",
            "duration_seconds": 610,
            "transcript": "private answer",
            "audio_url": "private.wav",
            "appearance_score": 99,
        })
        self.assertEqual(payload, {
            "id": "session_01",
            "application_id": "plugconnect",
            "status": "completed",
            "duration_seconds": 610,
        })

if __name__ == "__main__": unittest.main()
