import os
import sys


def main():
    if len(sys.argv) != 3:
        print("usage: convertWordToPdf.py <input.docx> <output.pdf>", file=sys.stderr)
        return 2

    input_path = os.path.abspath(sys.argv[1])
    output_path = os.path.abspath(sys.argv[2])
    if not os.path.exists(input_path):
        print(f"input file not found: {input_path}", file=sys.stderr)
        return 2

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    word = None
    document = None
    try:
        from win32com.client import DispatchEx

        word = DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        document = word.Documents.Open(input_path, ReadOnly=True)
        document.SaveAs(output_path, FileFormat=17)
        document.Close(False)
        document = None
        return 0 if os.path.exists(output_path) else 1
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        try:
            if document is not None:
                document.Close(False)
        except Exception:
            pass
        try:
            if word is not None:
                word.Quit()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
