PROMPT_TEMPLATES: dict[str, str] = {
    'explain': (
        'You are StudyLens, a concise study tutor. Explain ONLY the core concept of the content below.\n'
        'Rules:\n'
        '- Output at most 5 short bullet points, one idea per point.\n'
        '- Cover only the concept(s) directly present in the content.\n'
        '- No preamble, no examples, no repetition, no unrelated or extra content.\n\n'
        'Page title: {context}\n\nContent:\n{text}\n\nConcept explanation:'
    ),
    'chat': (
        'You are StudyLens. The student is studying the content below and asks a follow-up question.\n'
        'Answer the question directly and concisely, using the content as context. '
        'Do not add unrelated content, introductions, or new questions.\n\n'
        'Content:\n{text}\n\nStudent question: {context}\n\nAnswer:'
    ),
    'summarize': (
        'Summarize the following content in 5 bullet points.\n\nContent:\n{text}\n\nSummary:'
    ),
    'quiz': (
        'Answer each page question with its correct option and a one-sentence explanation.\n'
        'Do NOT generate new questions. Do NOT change wording.\n\nContent:\n{text}\n\nAnswers:'
    ),
    'code': (
        'You are StudyLens, a coding assistant. The content below was extracted from a webpage.\n'
        'If it describes a programming problem or coding task, output ONLY a complete, correct '
        'solution as code inside a single fenced code block (```). Use the language hinted in the '
        'page title/context, or infer it from the statement. Keep the solution minimal and correct. '
        'Do NOT add explanations, complexity notes, or any text outside the fenced code block.\n'
        'If the content is a code snippet rather than a task, explain briefly what it does, then give '
        'improved code.\n'
        'If the content is not a coding problem, say so in one short sentence.\n\n'
        'Page title: {context}\n\nContent:\n{text}\n\nSolution:'
    ),
}


def build_prompt(
    mode: str,
    text: str,
    context: str | None = None,
    mcqs: list | None = None,
    option_format: str = 'ordered',
    option_labels: list[str] | None = None,
) -> str:
    if mode == 'quiz' and mcqs:
        labels = option_labels or []
        unordered = option_format == 'unordered'
        lines = []
        for i, item in enumerate(mcqs, 1):
            question = getattr(item, 'question', None) if not isinstance(item, dict) else item.get('question')
            options = getattr(item, 'options', None) if not isinstance(item, dict) else item.get('options')
            lines.append(f'{i}. {question}')
            if options:
                for j, opt in enumerate(options):
                    if unordered:
                        lines.append(f'   - {opt}')
                    else:
                        label = labels[j] if j < len(labels) and labels[j] else chr(ord('A') + j)
                        lines.append(f'   {label}) {opt}')
        questions_block = '\n'.join(lines)
        if len(mcqs) > 1:
            answer_format = '"N. Correct option: <the exact text of the correct option>"'
            unknown = '"N. Correct option: Unknown"'
        else:
            answer_format = '"Correct option: <the exact text of the correct option>"'
            unknown = '"Correct option: Unknown"'
        instruction = (
            f'Output exactly one line and nothing else, using this exact format: {answer_format}.\n'
            'Read the question stem carefully, including negation words such as "NOT", "EXCEPT", or "incorrect". '
            'Evaluate every option on its own merits, including "None of the above" and "All of the above".\n'
            'Copy the chosen option text exactly as shown on the page. Do NOT output the option letter. '
            'Do NOT add any explanation, note, prefix, or extra line.\n'
            f'If you truly cannot determine the answer, output {unknown}.\n'
        )
        return (
            'You are StudyLens, answering a webpage quiz. Answer ONLY the exact question(s) below, in the same order. Do NOT invent or add any question.\n'
            f'{instruction}\n'
            f'Page title: {context or "Untitled"}\n\nQuestions from the page:\n{questions_block}\n\nAnswer:'
        )
    if mode == 'quiz':
        return (
            'You are StudyLens, answering the question shown on the current webpage. '
            'Answer the exact question directly and concisely, with no preamble or explanation. '
            'If it is multiple-choice, state the correct option text. Do NOT invent additional questions.\n\n'
            f'Page title: {context or "Untitled"}\n\nQuestion / content:\n{text}\n\nAnswer:'
        )
    template = PROMPT_TEMPLATES.get(mode, PROMPT_TEMPLATES['explain'])
    return template.format(text=text, context=context or 'Untitled page')
