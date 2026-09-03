"""
app/tools/files.py
==================

File tools: reading and writing text files and extracting PDF text.

Docstrings matter: Ollama turns each tool's docstring into the schema the
LLM sees when deciding which tool to call.
"""

import os

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


def read_file(file_path: str) -> str:
    """Reads and returns the contents of a text file."""
    if not os.path.exists(file_path):
        return f"Error: File '{file_path}' does not exist."
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def write_file(file_path: str, content: str) -> str:
    """Writes or overwrites text content to a file."""
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Content successfully written to: {file_path}"


def read_pdf(pdf_path: str) -> str:
    """Extracts text contents from a PDF file."""
    if not PdfReader:
        return "Error: pypdf is not installed. Install via `pip install pypdf`."
    if not os.path.exists(pdf_path):
        return f"Error: PDF '{pdf_path}' does not exist."

    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text
