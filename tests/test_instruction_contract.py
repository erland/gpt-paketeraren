from pathlib import Path


def test_dialog_contract():
    text = (Path(__file__).parents[1] / "packager" / "instructions.md").read_text(encoding="utf-8")
    required = [
        "Ställ normalt en fråga åt gången",
        "Håll bekräftelser korta",
        "kort slutgranskning",
        "behöver du inte fråga om ytterligare bekräftelse",
        "Håll leveransen kort",
        "inte omvandla idén till en färdig GPT-instruktion",
    ]
    for phrase in required:
        assert phrase in text, phrase
