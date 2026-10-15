import unittest
from unittest.mock import Mock, patch

import httpx
from google.genai.errors import APIError

import js.app as backend


def make_questions():
    stages = ["warmup", "standard", "standard", "stretch", "stretch"]
    return {
        "questions": [
            {
                "question": f"How would you approach role-specific challenge {number}?",
                "context": "Talk through your thinking step by step.",
                "category": "technical",
                "topic": f"Role topic {number}",
                "stage": stages[number - 1],
            }
            for number in range(1, 6)
        ]
    }


def make_feedback():
    return {
        "score": 82,
        "strengths": ["You explained your approach."],
        "weaknesses": ["Add a concrete verification step."],
        "missing_concepts": ["Mention how you would check edge cases."],
        "clarity_feedback": "Your explanation is easy to follow.",
        "relevance_feedback": "Your answer directly addresses the question.",
        "grammar_suggestions": ["Change 'did went' to 'went'."],
        "improved_answer": "I would first clarify the expected behavior, then test it.",
        "follow_up_question": "How would you verify the edge cases?",
    }


class InterviewApiTests(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()

    def test_generates_five_valid_questions_for_supported_role(self):
        with patch.object(backend, "_generate_json", return_value=make_questions()) as generate:
            response = self.client.post(
                "/api/questions",
                json={
                    "role": "embedded",
                    "experience": "student",
                    "type": "mixed",
                    "difficulty": "standard",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json["questions"]), 5)
        self.assertEqual(response.json["questions"][0]["category"], "technical")
        self.assertIn("Embedded Systems Engineer", generate.call_args.args[0])
        self.assertIn("warmup, standard, standard, stretch, stretch", generate.call_args.args[0])

    def test_rejects_invalid_role_without_calling_gemini(self):
        with patch.object(backend, "_generate_json") as generate:
            response = self.client.post(
                "/api/questions",
                json={
                    "role": "made-up-role",
                    "experience": "student",
                    "type": "mixed",
                    "difficulty": "standard",
                },
            )

        self.assertEqual(response.status_code, 400)
        generate.assert_not_called()

    def test_rejects_incomplete_generated_question_set(self):
        with patch.object(backend, "_generate_json", return_value={"questions": []}):
            response = self.client.post(
                "/api/questions",
                json={
                    "role": "web",
                    "experience": "entry",
                    "type": "technical",
                    "difficulty": "friendly",
                },
            )

        self.assertEqual(response.status_code, 502)
        self.assertIn("incomplete", response.json["error"])

    def test_rejects_question_set_without_confidence_progression(self):
        invalid = make_questions()
        invalid["questions"][0]["stage"] = "stretch"
        with patch.object(backend, "_generate_json", return_value=invalid):
            response = self.client.post(
                "/api/questions",
                json={
                    "role": "web",
                    "experience": "entry",
                    "type": "technical",
                    "difficulty": "standard",
                },
            )

        self.assertEqual(response.status_code, 502)
        self.assertIn("incorrectly staged", response.json["error"])

    def test_returns_complete_gemini_evaluation(self):
        with patch.object(backend, "_generate_json", return_value=make_feedback()) as generate:
            response = self.client.post(
                "/api/feedback",
                json={
                    "role": "ai_ml",
                    "experience": "entry",
                    "question": "How would you evaluate a classifier?",
                    "answer": "I would check its precision and recall.",
                    "previous_question": "What is a confusion matrix?",
                    "previous_answer": "It summarizes prediction outcomes.",
                    "is_follow_up": True,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, make_feedback())
        self.assertIn("Previous candidate answer", generate.call_args.args[0])
        self.assertIn("Is this a follow-up answer: True", generate.call_args.args[0])

    def test_rejects_unknown_role_in_evaluation(self):
        with patch.object(backend, "_generate_json") as generate:
            response = self.client.post(
                "/api/feedback",
                json={
                    "role": "unknown",
                    "question": "Question?",
                    "answer": "A sufficiently detailed answer.",
                },
            )

        self.assertEqual(response.status_code, 400)
        generate.assert_not_called()

    def test_missing_backend_api_key_returns_configuration_error(self):
        with patch.object(backend, "_api_key", return_value=None), patch.object(
            backend.genai, "Client"
        ) as client:
            response = self.client.post(
                "/api/questions",
                json={
                    "role": "software",
                    "experience": "student",
                    "type": "mixed",
                    "difficulty": "standard",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("missing its Gemini API key", response.json["error"])
        client.assert_not_called()

    def test_retries_transient_gemini_unavailable_errors(self):
        models = Mock()
        models.generate_content.side_effect = [
            APIError(503, {"error": {"status": "UNAVAILABLE"}}),
            Mock(text='{"ready": true}'),
        ]
        with patch.object(backend, "_api_key", return_value="test-only-key"), patch.object(
            backend.genai, "Client", return_value=Mock(models=models)
        ), patch.object(backend.time, "sleep") as sleep:
            result = backend._generate_json("test prompt", {})

        self.assertEqual(result, {"ready": True})
        self.assertEqual(models.generate_content.call_count, 2)
        sleep.assert_called_once_with(0.5)

    def test_rejects_out_of_range_or_incomplete_score(self):
        invalid = make_feedback()
        invalid["score"] = 101
        with patch.object(backend, "_generate_json", return_value=invalid):
            response = self.client.post(
                "/api/feedback",
                json={"question": "Question?", "answer": "My detailed answer."},
            )

        self.assertEqual(response.status_code, 502)
        self.assertIn("incomplete feedback", response.json["error"])

    def test_returns_clear_quota_error_without_upstream_details(self):
        quota_error = APIError(
            429,
            {"error": {"status": "RESOURCE_EXHAUSTED", "message": "sensitive upstream details"}},
        )
        with patch.object(backend, "_generate_json", side_effect=quota_error):
            response = self.client.post(
                "/api/feedback",
                json={"question": "Question?", "answer": "My detailed answer."},
            )

        self.assertEqual(response.status_code, 429)
        self.assertIn("usage limit", response.json["error"])
        self.assertNotIn("sensitive upstream details", str(response.json))

    def test_logs_allowlisted_quota_diagnostics_without_secrets(self):
        quota_error = APIError(
            429,
            {
                "error": {
                    "status": "RESOURCE_EXHAUSTED",
                    "message": "upstream details must remain private",
                    "details": [
                        {
                            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                            "metadata": {
                                "quota_metric": (
                                    "generativelanguage.googleapis.com/"
                                    "generate_content_free_tier_requests"
                                ),
                                "model": "gemini-2.0-flash",
                                "api_key": "DO_NOT_LOG_THIS_TEST_SECRET",
                            },
                        },
                        {
                            "@type": "type.googleapis.com/google.rpc.RetryInfo",
                            "retryDelay": "37.5s",
                        },
                    ],
                }
            },
        )
        with patch.object(backend, "_generate_json", side_effect=quota_error), patch.dict(
            "os.environ", {"GEMINI_MODEL": "gemini-2.0-flash"}
        ), self.assertLogs(backend.app.logger, level="ERROR") as captured:
            response = self.client.post(
                "/api/feedback",
                json={"question": "Question?", "answer": "My detailed answer."},
            )

        log_output = "\n".join(captured.output)
        self.assertEqual(response.status_code, 429)
        self.assertIn("quota_metric", log_output)
        self.assertIn("generativelanguage.googleapis.com/generate_content_free_tier_requests", log_output)
        self.assertIn("model", log_output)
        self.assertIn("gemini-2.0-flash", log_output)
        self.assertIn("retry_delay", log_output)
        self.assertIn("37.5 seconds", log_output)
        self.assertIn("RESOURCE_EXHAUSTED", log_output)
        self.assertNotIn("DO_NOT_LOG_THIS_TEST_SECRET", log_output)
        self.assertNotIn("upstream details must remain private", log_output)
        self.assertNotIn("DO_NOT_LOG_THIS_TEST_SECRET", str(response.json))

    def test_reports_gemini_network_failure_honestly(self):
        with patch.object(
            backend, "_generate_json", side_effect=httpx.ConnectError("private connection detail")
        ):
            response = self.client.post(
                "/api/questions",
                json={
                    "role": "communications",
                    "experience": "experienced",
                    "type": "technical",
                    "difficulty": "challenging",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("could not connect to Gemini", response.json["error"])
        self.assertNotIn("private connection detail", str(response.json))

    def test_api_endpoint_allows_local_frontend_cors(self):
        with patch.object(backend, "_generate_json", return_value=make_questions()):
            response = self.client.post(
                "/api/questions",
                headers={"Origin": "http://localhost:8000"},
                json={
                    "role": "hr",
                    "experience": "student",
                    "type": "behavioral",
                    "difficulty": "friendly",
                },
            )

        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://localhost:8000")

    def test_api_endpoint_supports_local_preflight_cors(self):
        response = self.client.options(
            "/api/questions",
            headers={
                "Origin": "http://127.0.0.1:8000",
                "Access-Control-Request-Method": "POST",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["Access-Control-Allow-Origin"],
            "http://127.0.0.1:8000",
        )
        self.assertIn("POST", response.headers["Access-Control-Allow-Methods"])

    def test_api_endpoint_allows_configured_deployment_origin(self):
        with patch.dict(
            "os.environ",
            {"CORS_ALLOWED_ORIGINS": "https://practice.example, https://preview.example"},
        ):
            response = self.client.options(
                "/api/questions",
                headers={
                    "Origin": "https://practice.example",
                    "Access-Control-Request-Method": "POST",
                },
            )

        self.assertEqual(
            response.headers["Access-Control-Allow-Origin"],
            "https://practice.example",
        )


if __name__ == "__main__":
    unittest.main()
