import unittest

from src.main import AnalysisRequest, analyze, benchmark, health


class ApiRouteTests(unittest.TestCase):
    def test_health_route(self):
        self.assertEqual(health(), {"status": "ok"})

    def test_benchmark_and_analysis_routes(self):
        benchmark_data = benchmark()
        self.assertTrue(benchmark_data["rows"])

        result = analyze(AnalysisRequest(rows=benchmark_data["rows"][:48]))

        self.assertGreater(result["funnelStats"]["retainedClean"], 0)
        self.assertTrue(result["reviews"])
        self.assertIn("triageRows", result)
        self.assertIn("heatmapCells", result)
        self.assertIn("telemetry", result)
        self.assertTrue(result["briefText"])


if __name__ == "__main__":
    unittest.main()
