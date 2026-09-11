import asyncio, sys
sys.path.insert(0, '.')

async def test():
    from app.services.generator import stream_response

    print('--- Full stream_response with FAKE Gemini key ---')
    events = []
    async for chunk in stream_response(
        query='Say hello',
        chunks=[],
        history=[],
        user_id=None,
        chat_id=None,
        model='gemini-2.0-flash',
        user_api_key='AIzaSy_FAKE_KEY_FOR_TESTING_12345678',
    ):
        events.append(chunk)
        print(f'  {chunk.strip()[:140]}')

    has_done  = any('"type": "done"'  in e for e in events)
    has_token = any('"type": "token"' in e for e in events)
    print(f'\nTotal events : {len(events)}')
    print(f'Has token    : {has_token}')
    print(f'Has done     : {has_done}')
    print('PASS' if has_done else 'FAIL: no done event sent!')

asyncio.run(test())
