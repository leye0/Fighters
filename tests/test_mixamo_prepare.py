import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "prepare-selected-mixamo.py"
spec = importlib.util.spec_from_file_location("prepare_selected_mixamo", MODULE)
assert spec and spec.loader
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class PrepareSelectedMixamoTest(unittest.TestCase):
    def test_all_sixty_three_exact_names_go_to_acquisition_and_conversion(self):
        names = [f"Animation_{i:02}.fbx" for i in range(63)]
        steps = prepare.commands(Path("/tmp/fighters-test-pack"), names, 5.0)
        self.assertEqual(len(steps), 3)
        for step in steps[:2]:
            selected = [step[i + 1] for i, value in enumerate(step[:-1]) if value == "--name"]
            self.assertEqual(selected, names)
        self.assertEqual(steps[0][steps[0].index("--request-interval") + 1], "5.0")
        self.assertIn("--require-all", steps[1])
        self.assertEqual(Path(steps[2][-1]).name, "Fighters-selected-63.glb")


if __name__ == "__main__":
    unittest.main()
