from stockbuddy.personas import PERSONAS, builtin_prompt, builtin_prompts


def test_stored_built_in_prompts_match_the_library():
    # If this fails after upgrading ai-hedge-fund, regenerate src/stockbuddy/personas_builtin.py.
    assert builtin_prompts() == {p.persona: builtin_prompt(p.persona) for p in PERSONAS}
