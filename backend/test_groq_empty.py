"""Test Groq errors with empty, invalid, and valid keys."""
import asyncio, sys, os
sys.path.insert(0, '.')

async def test_key(label, key):
    from groq import AsyncGroq
    client = AsyncGroq(api_key=key)
    print(f'\n--- {label} ---')
    try:
        stream = await client.chat.completions.create(
            model='compound-beta-mini', max_tokens=10,
            messages=[{'role': 'user', 'content': 'hi'}], stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta: print(f'  token: {repr(delta)}')
        print('  SUCCESS')
    except Exception as e:
        print(f'  Error type: {type(e).__name__}')
        print(f'  Error str : {str(e)[:200]}')

async def main():
    await test_key('EMPTY KEY', '')
    await test_key('FAKE KEY (gsk_fake)', 'gsk_fake123456789')

    # Test with real key if available
    real_key = os.getenv('GROQ_API_KEY', '')
    if real_key:
        await test_key('REAL KEY from env', real_key)

asyncio.run(main())
