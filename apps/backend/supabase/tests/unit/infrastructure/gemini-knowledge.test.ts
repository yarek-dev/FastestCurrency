import { deepStrictEqual, doesNotMatch, match, strictEqual } from 'node:assert/strict'
import type { DialogueMessage } from '@backend/supabase/functions/telegram-webhook/application/ports/message-repository.ts'
import { createAnswerKnowledgeQuestion, type PaidServiceGuidance, type PaidServiceGuidanceKey } from '@backend/supabase/functions/telegram-webhook/application/use-cases/answer-knowledge-question.ts'
import { createGeminiKnowledge } from '@backend/supabase/functions/telegram-webhook/infrastructure/gemini/gemini-knowledge.ts'
import { createReplyToQuestion } from '@backend/supabase/functions/telegram-webhook/application/use-cases/reply-to-question.ts'

const update = { message: { chat: { type: 'private', id: 123 }, text: 'Сколько стоит гистероскопия?' } }
const matches = {
  paidServices: [{
    id: '1',
    kind: 'tariff',
    title: 'Гистероскопия',
    body: null,
    section: 'Гинекология',
    audience: 'belarus_citizens',
    unit: null,
    price_label: null,
    price_type: 'fixed',
    amount: '150.00',
    max_amount: null,
    effective_from: null,
  }],
  researchDepartment: [],
  clinicalDepartment: [],
}
const unusedContext = {
  fitHistory: () => { throw new Error('Should not fit history') },
  rewriteQuestion: () => { throw new Error('Should not rewrite the question') },
}
const unusedGuidance = { readPaidServiceGuidance: () => { throw new Error('Should not read paid service guidance') } }

function bookingGuidance(guidance_key: PaidServiceGuidanceKey, body: string): PaidServiceGuidance {
  return {
    guidance_key, body, kind: 'booking_rule', title: 'Условия обращения', section: null, audience: null,
    unit: null, price_label: null, price_type: null, amount: null, max_amount: null, effective_from: null,
  }
}

function answerResponse(text = 'Стоимость — 150 BYN.', needsClarification = false, needsChildCitizenship = false) {
  return Response.json({
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ thought: true, text: 'hidden' }, {
        text: JSON.stringify({ text, needsClarification, needsChildCitizenship }),
      }] },
    }],
  })
}

Deno.test('searches with the original question and generates one grounded reply', async () => {
  const calls: string[] = []
  const handler = createReplyToQuestion(
    createAnswerKnowledgeQuestion({
      ...unusedGuidance,
      search: async (question) => {
        strictEqual(question, update.message.text)
        calls.push('search')
        return matches
      },
      ...createGeminiKnowledge({
        apiKey: 'test-key',
        model: 'test-model',
        fetchRequest: async (url, init) => {
          calls.push('generate')
          strictEqual(url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent')
          strictEqual(new Headers(init?.headers).get('x-goog-api-key'), 'test-key')
          const request = JSON.parse(String(init?.body))
          deepStrictEqual(JSON.parse(request.contents[0].parts[0].text), { question: update.message.text, matches })
          strictEqual(request.generationConfig.responseMimeType, 'application/json')
          strictEqual(request.tools, undefined)
          return answerResponse()
        },
      }),
    }),
  )

  strictEqual(await handler(update.message.text), 'Стоимость — 150 BYN.')
  deepStrictEqual(calls, ['search', 'generate'])
})

Deno.test('an empty vector search asks for clarification without calling the generation model', async () => {
  const handler = createReplyToQuestion(
    createAnswerKnowledgeQuestion({
      ...unusedContext,
      ...unusedGuidance,
      search: async () => ({ paidServices: [], researchDepartment: [], clinicalDepartment: [] }),
      answer: () => { throw new Error('Should not generate an answer') },
    }),
  )

  strictEqual(await handler(update.message.text), 'Попробуйте, пожалуйста, сформулировать вопрос иначе. Например, уточните название услуги или отделения.')
})

Deno.test('offers the verified department number without appending a clarification', async () => {
  const question = 'Как позвонить доктору Иванову?'
  const expected = 'Чтобы связаться с доктором Ивановым, позвоните в его отделение по телефону +375 (17) 000-00-01.'
  const clinicalDepartment = [
    { id: '1', kind: 'staff', title: 'Доктор Иванов', body: 'Работает в отделении восстановительного лечения.' },
    { id: '2', kind: 'contact', title: 'Отделение восстановительного лечения', body: 'Телефон +375 (17) 000-00-01.' },
  ]
  const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
    ...unusedGuidance,
    search: async () => ({ paidServices: [], researchDepartment: [], clinicalDepartment }),
    ...createGeminiKnowledge({
      apiKey: 'test-key',
      model: 'test-model',
      fetchRequest: async (_, init) => {
        const request = JSON.parse(String(init?.body))
        const prompt = request.systemInstruction.parts[0].text
        match(prompt, /Никогда не упоминай предоставленные данные/)
        match(prompt, /Не выдавай номер отделения за личный номер врача/)
        match(prompt, /подтверждённый контакт.*needsClarification в false/)
        return answerResponse(expected)
      },
    }),
  }))

  strictEqual(await handler(question), expected)
})

Deno.test('passes explicit Belarusian citizen policy questions to Gemini even without search results', async () => {
  const emptyMatches = { paidServices: [], researchDepartment: [], clinicalDepartment: [] }
  const examples = [
    ['Сколько стоит МРТ для гражданина РБ?', 'belarus_paid_diagnostics', 'Для граждан РБ платное МРТ не проводится.'],
    ['Можно ли платно записать ребёнка с гражданством Республики Беларусь?', 'belarus_child_paid_services', 'Детям с гражданством РБ помощь оказывается бесплатно только по направлению.'],
  ] as const
  for (const [question, key, expected] of examples) {
    const guidance = [{ ...bookingGuidance(key, expected), kind: 'availability_rule', audience: 'belarus_citizens' }]
    const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
      ...createGeminiKnowledge({
        apiKey: 'test-key',
        model: 'test-model',
        fetchRequest: async (_, init) => {
          const request = JSON.parse(String(init?.body))
          deepStrictEqual(JSON.parse(request.contents[0].parts[0].text), { question, matches: emptyMatches, guidance })
          const instruction = request.systemInstruction.parts[0].text
          doesNotMatch(instruction, /платное МРТ не проводится|бесплатно только по направлению/)
          match(instruction, /из guidance имеют приоритет над поисковой выдачей/)
          return answerResponse(expected)
        },
      }),
      search: async () => emptyMatches,
      readPaidServiceGuidance: async (keys) => {
        deepStrictEqual(keys, [key])
        return guidance
      },
    }))
    strictEqual(await handler(question), expected)
  }
})

Deno.test('can answer about childbirth and IVF bookings without vector search matches', async () => {
  const search = async () => ({ paidServices: [], researchDepartment: [], clinicalDepartment: [] })
  const examples = [
    ['Сколько стоят платные роды?', 'maternity_booking', 'Запись на роды на сроке 34–36 недель по телефону +375 17 323 52 15.'],
    ['Как записаться на ЭКО?', 'ivf_booking', 'Позвоните по телефонам +375 (17) 270-77-38 или +375 (17) 232-01-30.'],
  ] as const
  for (const [question, key, expected] of examples) {
    const guidance = [bookingGuidance(key, expected)]
    const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
      ...createGeminiKnowledge({
        apiKey: 'test-key',
        model: 'test-model',
        fetchRequest: async (_, init) => {
          const request = JSON.parse(String(init?.body))
          deepStrictEqual(JSON.parse(request.contents[0].parts[0].text), { question, matches: await search(), guidance })
          const instruction = request.systemInstruction.parts[0].text
          doesNotMatch(instruction, /34–36|323 52 15|308,14|4 500|270-77-38|232-01-30/)
          return answerResponse(expected)
        },
      }),
      search,
      readPaidServiceGuidance: async (keys) => {
        if (key === 'ivf_booking') deepStrictEqual(keys, [key])
        else deepStrictEqual(keys, [
          key, 'maternity_contract', 'maternity_individual', 'maternity_consultation',
          'maternity_foreign_natural', 'maternity_foreign_cesarean',
        ])
        return guidance
      },
    }))
    strictEqual(await handler(question), expected)
  }
})

Deno.test('asks a child’s citizenship without using a generic tariff and accepts the clarification', async () => {
  const question = 'Какие платные медицинские услуги есть для детей?'
  const followup = 'РБ'
  const clarifiedQuery = 'Какие платные услуги есть для ребёнка с гражданством РБ?'
  const expectedReply = 'Детям с гражданством РБ помощь оказывается бесплатно только по направлению.'
  const searches: string[] = []
  const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
    ...createGeminiKnowledge({
      apiKey: 'test-key',
      model: 'test-model',
      fetchRequest: async (_, init) => {
        const request = JSON.parse(String(init?.body))
        const payload = JSON.parse(request.contents[0].parts.at(-1).text)
        deepStrictEqual(payload.matches.paidServices, [])
        match(request.systemInstruction.parts[0].text, /гражданство ребёнка не названо/)
        return payload.question === question ? answerResponse('', true, true) : answerResponse(expectedReply)
      },
    }),
    fitHistory: async (history) => history,
    readPaidServiceGuidance: async () => [{
      ...bookingGuidance('belarus_child_paid_services', expectedReply), kind: 'availability_rule', audience: 'belarus_citizens',
    }],
    rewriteQuestion: async () => clarifiedQuery,
    search: async (query) => {
      searches.push(query)
      return matches
    },
  }))

  const firstReply = await handler(question)
  strictEqual(firstReply, 'Подскажите, пожалуйста, какое гражданство у ребёнка?')
  strictEqual(await handler(followup, async () => [
    { role: 'user', text: question },
    { role: 'bot', text: firstReply },
  ]), expectedReply)
  deepStrictEqual(searches, [question, clarifiedQuery])
})

Deno.test('keeps the confirmed part of a reply and offers a manager on a second clarification', async () => {
  const confirmed = 'Стоимость — 150 BYN. По условиям записи нужно уточнение.'
  const history: DialogueMessage[] = []
  const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
    ...unusedGuidance,
    ...createGeminiKnowledge({
      apiKey: 'test-key',
      model: 'test-model',
      fetchRequest: async () => answerResponse(history.length ? '' : confirmed, true),
    }),
    fitHistory: async (messages) => messages,
    rewriteQuestion: async () => undefined,
    search: async () => matches,
  }))

  const firstReply = await handler('Сколько стоит услуга и как записаться?', async () => history)
  strictEqual(firstReply, `${confirmed}\n\nПопробуйте, пожалуйста, сформулировать вопрос иначе. Например, уточните название услуги или отделения.`)
  history.push({ role: 'bot', text: firstReply })
  let historyReads = 0
  const secondReply = await handler('А как на неё записаться?', async () => {
    historyReads++
    return history
  })
  strictEqual(secondReply, 'Если хотите, чтобы вам помог менеджер, напишите «Позовите менеджера».')
  strictEqual(historyReads, 1)
})

Deno.test('acknowledges an explicit manager request without asking Gemini', async () => {
  const handler = createReplyToQuestion(() => { throw new Error('Should not generate an answer') })
  strictEqual(await handler('Позовите менеджера'), 'Запрос на подключение менеджера сохранён в этом чате.')
})

Deno.test('searches each question and gives one reply with records from all three tables', async () => {
  const questions = ['Сколько стоит гистероскопия?', 'Какие есть научные лаборатории?', 'Когда работает поликлиника?']
  const searches: string[] = []
  const researchDepartment = [{ id: '1', kind: 'research_area', title: 'Лаборатория генетики', body: 'Генетические исследования' }]
  const clinicalDepartment = [{ id: '1', kind: 'schedule', title: 'Поликлиника', body: 'Будни с 08:00 до 20:00' }]
  const message = questions.join(' ')
  const answerQuestion = createAnswerKnowledgeQuestion({
    ...unusedContext,
    ...unusedGuidance,
    search: async (query) => {
      searches.push(query)
      return {
        ...matches,
        researchDepartment: query === questions[1] ? researchDepartment : [],
        clinicalDepartment: query === questions[2] ? clinicalDepartment : [],
      }
    },
    answer: async (question, found) => {
      strictEqual(question, message)
      deepStrictEqual(found, { ...matches, researchDepartment, clinicalDepartment })
      return { text: 'Справка по трём вопросам.', needsClarification: false }
    },
  })

  deepStrictEqual(await answerQuestion(message), { text: 'Справка по трём вопросам.', needsClarification: false })
  deepStrictEqual(searches, questions)
})

Deno.test('keeps the newest history within the token budget and uses it for search and answering', async () => {
  const question = 'А по субботам?'
  const searchQuestion = 'Делают ли УЗИ щитовидной железы по субботам?'
  const history: DialogueMessage[] = [
    { role: 'bot', text: 'Earlier topic' },
    { role: 'user', text: 'Сколько стоит УЗИ щитовидной железы?' },
    { role: 'bot', text: 'Стоимость — 150 BYN.' },
  ]
  const checkedLengths: number[] = []
  const prompts: unknown[] = []
  const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
    ...unusedGuidance,
    ...createGeminiKnowledge({
      apiKey: 'test-key',
      model: 'test-model',
      fetchRequest: async (url, init) => {
        const { contents } = JSON.parse(String(init?.body))
        const [historyPart, prompt] = contents[0].parts
        const payload = JSON.parse(historyPart.text)
        if (String(url).endsWith(':countTokens')) {
          checkedLengths.push(payload.history.length)
          strictEqual(prompt, undefined)
          return Response.json({ totalTokens: payload.history.length === 3 ? 2001 : 2000 })
        }
        deepStrictEqual(payload, { history: history.slice(-2) })
        prompts.push(JSON.parse(prompt.text))
        return prompts.length === 1
          ? Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: searchQuestion }] } }] })
          : answerResponse()
      },
    }),
    search: async (query) => {
      strictEqual(query, searchQuestion)
      return matches
    },
  }))

  strictEqual(await handler(question, async () => history), 'Стоимость — 150 BYN.')
  deepStrictEqual(checkedLengths, [3, 1, 2])
  deepStrictEqual(prompts, [{ question }, { question, matches }])
})

Deno.test('uses the current question alone when history cannot fit or token counting fails', async () => {
  for (const countResponse of [Response.json({ totalTokens: 2001 }), new Response(null, { status: 503 })]) {
    const calls: string[] = []
    const handler = createReplyToQuestion(createAnswerKnowledgeQuestion({
      ...unusedGuidance,
      ...createGeminiKnowledge({
        apiKey: 'test-key',
        model: 'test-model',
        fetchRequest: async (url, init) => {
          if (String(url).endsWith(':countTokens')) {
            calls.push('count')
            return countResponse
          }
          calls.push('answer')
          const { contents } = JSON.parse(String(init?.body))
          deepStrictEqual(contents[0].parts, [{ text: JSON.stringify({ question: update.message.text, matches }) }])
          return answerResponse()
        },
      }),
      search: async (query) => {
        strictEqual(query, update.message.text)
        calls.push('search')
        return matches
      },
    }))

    strictEqual(await handler(update.message.text, async () => [{ role: 'user', text: 'A long message' }]), 'Стоимость — 150 BYN.')
    deepStrictEqual(calls, ['count', 'search', 'answer'])
  }
})

Deno.test('a vector search failure gives the user a temporary error message', async () => {
  const handler = createReplyToQuestion(
    createAnswerKnowledgeQuestion({
      ...unusedContext,
      ...unusedGuidance,
      search: () => { throw new Error('Embedding endpoint unavailable') },
      answer: () => { throw new Error('Should not generate an answer') },
    }),
  )

  strictEqual(await handler(update.message.text), 'Сейчас не могу ответить на ваш вопрос. Пожалуйста, напишите чуть позже.')
})

Deno.test('retries a transient Gemini 503 within the same request deadline', async () => {
  const signals: Array<AbortSignal | null | undefined> = []
  const deadlines: number[] = []
  const { answer } = createGeminiKnowledge({
    apiKey: 'test-key',
    model: 'test-model',
    fetchRequest: async (_, init) => {
      signals.push(init?.signal)
      return signals.length === 1 ? new Response(null, { status: 503 }) : answerResponse()
    },
  })

  const originalTimeout = AbortSignal.timeout
  AbortSignal.timeout = (milliseconds) => {
    deadlines.push(milliseconds)
    return originalTimeout(milliseconds)
  }
  try {
    deepStrictEqual(await answer(update.message.text, matches, []), { text: 'Стоимость — 150 BYN.', needsClarification: false })
  } finally {
    AbortSignal.timeout = originalTimeout
  }
  deepStrictEqual(deadlines, [20_000])
  strictEqual(signals.length, 2)
  strictEqual(signals[0], signals[1])
})
