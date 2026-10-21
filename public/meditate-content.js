/* Mind Journal — meditation library. All scripts are original.
   Each session: intro cues (seconds from start), gentle reminders spread through
   the middle (more silence in longer sits), and outro cues (seconds before the end). */
window.MEDITATE_LIBRARY = (function () {
  var OUTRO = [
    [55, "Slowly, begin to let the practice go. Let the breath be completely natural."],
    [32, "Notice how you feel right now. There's nothing to change."],
    [12, "In a moment you'll hear the bell. Take your time coming back."]
  ];

  var courses = [
    {
      id: "learn", title: "Learn to meditate", sub: "7 days · the basics, gently",
      color: "var(--yolk)", face: "smile",
      about: "Seven short sits that teach the core skills one at a time: resting with the breath, noticing the body, letting thoughts pass, and being kind to yourself. Do one a day — or whenever you can.",
      sessions: [
        {
          id: "learn-1", title: "Arriving", sub: "Day 1 · resting with the breath", lens: [3, 5, 10], len: 5, breath: [4, 6],
          about: "There's nothing to get right. Today you simply arrive, and notice yourself breathing.",
          intro: [
            [0, "Find a position that feels steady and comfortable — sitting or lying down."],
            [10, "Let your eyes close, or rest your gaze softly on the floor."],
            [22, "Take one deeper breath in… and a long, slow breath out."],
            [36, "Now let the breath find its own rhythm. You don't need to control it."],
            [50, "Notice where you feel the breath most clearly. The nose, the chest, or the belly."]
          ],
          reminders: [
            "Just rest your attention there, on the feeling of breathing.",
            "If your mind has wandered, that's completely normal. Gently come back to the breath.",
            "Each time you notice and return — that is the practice.",
            "Breathing in, knowing you're breathing in. Breathing out, knowing you're breathing out.",
            "Let the body be heavy and supported.",
            "No need to chase calm. Just keep the breath company."
          ]
        },
        {
          id: "learn-2", title: "Counting breaths", sub: "Day 2 · a simple anchor", lens: [5, 10], len: 5, breath: [4, 6],
          about: "Counting gives a busy mind something small to hold on to.",
          intro: [
            [0, "Settle in. Let your shoulders drop and your jaw soften."],
            [12, "A few slow breaths to arrive. In… and out."],
            [28, "Now start counting each out-breath. One… two… three… up to ten."],
            [44, "When you reach ten, start again from one. If you lose count, simply start again. No problem at all."]
          ],
          reminders: [
            "Counting each breath out, quietly, in your mind.",
            "Lost count? That's okay. Begin again at one.",
            "Let the numbers be soft, almost a whisper.",
            "Notice the little pause at the end of each out-breath.",
            "If you're past ten, smile, and return to one."
          ]
        },
        {
          id: "learn-3", title: "The body", sub: "Day 3 · a gentle body scan", lens: [5, 10, 15], len: 10, breath: [4, 6],
          about: "Moving your attention slowly through the body brings you out of your head and into the present.",
          intro: [
            [0, "Get comfortable, and let the body be fully supported."],
            [14, "Bring your attention to the top of your head. Just notice what's there."],
            [32, "Move down to your forehead, your eyes, your cheeks. Let them soften."],
            [52, "Your jaw. Let it unclench a little. Your tongue resting in your mouth."]
          ],
          reminders: [
            "Now your neck and shoulders. Notice any tightness, and let it be.",
            "Down through your arms, to your hands. Can you feel your fingertips?",
            "Your chest and upper back, rising and falling with the breath.",
            "Your belly. Let it be soft.",
            "Your lower back, your hips, the places you're touching the floor or chair.",
            "Down through your legs, to your knees, your calves.",
            "Your feet. The soles of your feet, your toes.",
            "Now feel the whole body at once, breathing."
          ]
        },
        {
          id: "learn-4", title: "Thoughts are visitors", sub: "Day 4 · letting thoughts pass", lens: [5, 10], len: 5, breath: [4, 6],
          about: "You can't stop thoughts — and you don't need to. Today you practise noticing them without following them.",
          intro: [
            [0, "Settle in, and rest with the breath for a few moments."],
            [20, "Sooner or later, a thought will come. That's what minds do."],
            [36, "When you notice you're thinking, silently say 'thinking'. Then return to the breath."],
            [54, "Imagine thoughts as clouds passing across a wide sky. You are the sky."]
          ],
          reminders: [
            "Noticing a thought… 'thinking'… and coming back.",
            "No need to push thoughts away. Just don't climb aboard.",
            "Planning, remembering, worrying — all just visitors.",
            "The moment you notice is a moment of awareness. Well done.",
            "Back to the simple feeling of breathing."
          ]
        },
        {
          id: "learn-5", title: "Listening", sub: "Day 5 · sounds as they are", lens: [5, 10], len: 5, breath: [4, 6],
          about: "Sounds are always here, always now. They make a beautiful anchor for the present moment.",
          intro: [
            [0, "Find your posture, and take a slow breath."],
            [14, "Now open your attention to sound. Whatever you can hear."],
            [30, "Sounds near you. Sounds far away. Even the quiet between sounds."],
            [48, "No need to name them or like them. Just hear them arrive and fade."]
          ],
          reminders: [
            "Letting sounds come to you, like waves to the shore.",
            "If you're lost in thought, simply listen again.",
            "Notice the quietest sound you can hear.",
            "Every sound is happening right now. Let it bring you here."
          ]
        },
        {
          id: "learn-6", title: "Kindness", sub: "Day 6 · being kind to yourself", lens: [5, 10], len: 5, breath: [4, 7],
          about: "Meditation goes deeper when it's warm. Today you offer yourself a little kindness.",
          intro: [
            [0, "Settle in. If it feels okay, place a hand on your heart."],
            [16, "Think of how you'd speak to a good friend who's having a hard day."],
            [34, "Now offer that same warmth to yourself. Silently repeat: May I be kind to myself."],
            [52, "May I be gentle with myself. May I be at ease."]
          ],
          reminders: [
            "May I be kind to myself.",
            "May I accept myself as I am, right now.",
            "If it feels awkward, that's fine. Just let the words be there.",
            "May I be at ease.",
            "Feel the warmth of your hand. You're looking after yourself."
          ]
        },
        {
          id: "learn-7", title: "On your own", sub: "Day 7 · mostly silence", lens: [5, 10, 15], len: 10, breath: [4, 6], gap: 150,
          about: "A graduation sit. Just a few words at the start, then quiet. Use whatever you've learned this week.",
          intro: [
            [0, "Welcome back. This time you'll sit mostly in silence."],
            [12, "Settle with the breath. Return whenever you wander."],
            [26, "Use any anchor you like — breath, body, or sound. I'll be quiet now."]
          ],
          reminders: ["Gently, back to your anchor.", "Still here. Still breathing."]
        }
      ]
    },
    {
      id: "sos", title: "Anxiety SOS", sub: "3 sessions · for the hard moments",
      color: "var(--coral)", face: "worried",
      about: "Short, practical sits for when anxiety is loud. Use them anywhere — even with your eyes open.",
      sessions: [
        {
          id: "sos-1", title: "5-4-3-2-1 grounding", sub: "Come back to the room", lens: [3], len: 3, breath: [4, 6],
          about: "Use your senses to step out of the spiral and back into the present.",
          intro: [
            [0, "You're safe to slow down now. Keep your eyes open."],
            [8, "Look around and find five things you can see. Name them quietly."],
            [32, "Now four things you can feel. Your feet on the floor, your clothes, the air."],
            [58, "Three things you can hear."],
            [80, "Two things you can smell, or like the smell of."],
            [100, "And one slow breath you can taste — in through the nose, out through the mouth."],
            [118, "You're here. In this room. In this moment."]
          ],
          reminders: [],
          outro: [[30, "Notice your feet on the ground. Steady."], [12, "Whenever you're ready, carry this steadiness with you."]]
        },
        {
          id: "sos-2", title: "The longer out-breath", sub: "Tell your body it's safe", lens: [3, 5], len: 3, breath: [4, 8],
          about: "When the out-breath is longer than the in-breath, the body starts to settle.",
          intro: [
            [0, "Let's slow the breath together. Follow the circle on the screen."],
            [10, "Breathe in for four… and out for eight. As slowly as feels okay."],
            [30, "If eight is too long, make it six. Longer out than in — that's all."]
          ],
          reminders: [
            "In for four… out, slowly, for eight.",
            "Let the shoulders drop on each out-breath.",
            "You're doing this. Your body is listening.",
            "Nothing to fix right now. Just this breath."
          ]
        },
        {
          id: "sos-3", title: "Soften and allow", sub: "Make room for the feeling", lens: [5, 10], len: 5, breath: [4, 7],
          about: "Fighting a feeling makes it louder. This sit practises letting it be, with kindness.",
          intro: [
            [0, "Settle in, and notice where you feel the anxiety in your body."],
            [16, "Maybe tightness in the chest, a knot in the stomach, a buzzing."],
            [34, "Breathe gently into that place. Soften around it, like a warm hand."],
            [54, "You can say quietly: it's okay to feel this. It will pass."]
          ],
          reminders: [
            "Soften… allow… let it be here.",
            "Feelings rise and fall, like waves. You can ride this one.",
            "Breathing into the tight places. Breathing out, softening.",
            "You don't have to like it. Just make a little room."
          ]
        }
      ]
    },
    {
      id: "sleep", title: "Sleep wind-down", sub: "3 sessions · drift off gently",
      color: "var(--lavender)", face: "sleepy",
      about: "Lie down, lights low. These sits ease your body and mind towards sleep. It's fine to fall asleep before the end.",
      sessions: [
        {
          id: "sleep-1", title: "Body scan for sleep", sub: "Heavy, warm, resting", lens: [10, 15, 20], len: 15, breath: [4, 7], noEndBell: true,
          about: "A slow walk through the body, letting each part grow heavy.",
          intro: [
            [0, "Lie down and let the bed hold all of your weight."],
            [16, "Let your breath slow down by itself. You've done enough for today."],
            [34, "Bring your attention to your feet. Let them grow heavy and warm."]
          ],
          reminders: [
            "Your ankles and calves, heavy and soft.",
            "Your knees and thighs, sinking into the bed.",
            "Your hips and lower back, letting go.",
            "Your belly, rising and falling, slow and easy.",
            "Your chest, your shoulders, melting down.",
            "Your arms, your hands, completely still.",
            "Your neck, your face, your eyes. Soft.",
            "The whole body, heavy, warm, resting."
          ],
          outro: [[40, "There's nowhere you need to be. Let sleep come when it's ready."], [15, "Rest now."]]
        },
        {
          id: "sleep-2", title: "Counting down", sub: "From fifty, slowly", lens: [10, 15], len: 10, breath: [4, 7], noEndBell: true,
          about: "A slow countdown gives the thinking mind a gentle, boring job — perfect for sleep.",
          intro: [
            [0, "Lie comfortably and close your eyes."],
            [14, "With each out-breath, count down silently, starting at fifty."],
            [30, "Fifty… forty-nine… forty-eight… If you lose your place, start again anywhere."]
          ],
          reminders: [
            "Counting down, one number for each slow breath out.",
            "Let each number feel heavier and slower than the last.",
            "Lost the count? Begin again. It doesn't matter at all.",
            "Sinking a little deeper with every number."
          ],
          outro: [[30, "Let the numbers fade away now."], [12, "Rest."]]
        },
        {
          id: "sleep-3", title: "Let the day go", sub: "Close the open tabs", lens: [10], len: 10, breath: [4, 7], noEndBell: true,
          about: "Gently set down today's leftovers, so your mind can switch off.",
          intro: [
            [0, "Lie down, and take a long breath out — like a sigh."],
            [16, "Think of today. Whatever happened, it's over now."],
            [32, "Picture placing each thought from today into a box, and closing the lid."],
            [52, "Tomorrow's things can wait for tomorrow. They'll still be there."]
          ],
          reminders: [
            "If a thought from today returns, place it gently back in the box.",
            "Thank your body for carrying you through today.",
            "Nothing more to do. Nothing more to solve tonight.",
            "Breathing slowly, sinking into rest."
          ],
          outro: [[30, "Let go of the practice, too."], [12, "Sleep well."]]
        }
      ]
    },
    {
      id: "focus", title: "Focus reset", sub: "3 sessions · clear the static",
      color: "var(--sky)", face: "calm",
      about: "Short sits for between tasks, before deep work, or when your attention feels scattered.",
      sessions: [
        {
          id: "focus-1", title: "Two-minute reset", sub: "Between tasks", lens: [2, 3], len: 2, breath: [4, 4],
          about: "A tiny pause to close one task before you open the next.",
          intro: [
            [0, "Pause what you're doing. Hands still. Shoulders down."],
            [10, "Three slow breaths. In… and out."],
            [30, "Let the last task finish in your mind. It's done."],
            [50, "Feel your feet. Feel your hands. You're here."]
          ],
          reminders: ["Just breathing. Nothing else for now."],
          outro: [[25, "Now choose the one thing you'll do next."], [10, "Begin it slowly, with full attention."]]
        },
        {
          id: "focus-2", title: "One point of attention", sub: "Train the focus muscle", lens: [5, 10], len: 5, breath: [4, 4],
          about: "Resting attention on one point — and returning when it slips — is how focus is built.",
          intro: [
            [0, "Sit upright, alert but relaxed."],
            [12, "Bring your attention to the very tip of your nose, where the air enters."],
            [28, "Feel the coolness of the in-breath, the warmth of the out-breath."],
            [46, "Keep your attention right there. When it slips, bring it back. That's a rep."]
          ],
          reminders: [
            "Right at the tip of the nose.",
            "Each return is a rep. You're getting stronger.",
            "Cool air in… warm air out.",
            "Distracted? Gently, firmly, back."
          ]
        },
        {
          id: "focus-3", title: "Before deep work", sub: "Set an intention", lens: [5], len: 5, breath: [4, 4],
          about: "Arrive fully, then decide what deserves your attention.",
          intro: [
            [0, "Close your eyes and take a few full breaths."],
            [16, "Notice any buzz in the mind — messages, to-dos, noise. Let it settle like silt in water."],
            [40, "Now ask: what is the one thing that matters most in the next hour?"],
            [60, "Picture yourself doing it calmly, with care."]
          ],
          reminders: [
            "Resting with the breath, the water settling.",
            "Returning to your one thing.",
            "Calm attention. One thing at a time."
          ],
          outro: [[30, "Hold your intention lightly."], [12, "When the bell rings, begin."]]
        }
      ]
    },
    {
      id: "kindness", title: "Loving-kindness", sub: "3 sessions · warmth for you and others",
      color: "var(--rose)", face: "joy",
      about: "A classic practice of offering good wishes — first to yourself, then outward. It grows gently with practice.",
      sessions: [
        {
          id: "kind-1", title: "For yourself", sub: "Start where you are", lens: [5, 10], len: 5, breath: [4, 7],
          about: "Offering yourself the kindness you so easily give others.",
          intro: [
            [0, "Settle in, and let a soft smile come to your face if it wants to."],
            [14, "Picture yourself as you are right now."],
            [28, "Silently offer: May I be safe. May I be well. May I be at ease."]
          ],
          reminders: ["May I be safe.", "May I be healthy and strong.", "May I be at ease.", "May I be kind to myself, just as I am."]
        },
        {
          id: "kind-2", title: "For someone you love", sub: "Easy warmth", lens: [5, 10], len: 5, breath: [4, 7],
          about: "Bring to mind someone who makes you smile, and let the warmth flow.",
          intro: [
            [0, "Settle in, and take a few slow breaths."],
            [14, "Bring to mind someone you love easily. See their face."],
            [30, "Silently wish them well: May you be safe. May you be happy."]
          ],
          reminders: ["May you be safe.", "May you be happy.", "May you be healthy.", "May you be at ease.", "Notice how it feels to wish someone well."]
        },
        {
          id: "kind-3", title: "For everyone", sub: "Widening the circle", lens: [5, 10], len: 10, breath: [4, 7],
          about: "Slowly let your kindness grow — to strangers, to people who are hard, to everyone.",
          intro: [
            [0, "Begin by offering kindness to yourself. May I be well."],
            [18, "Now someone you love. May you be well."],
            [36, "Now someone you barely know — a shopkeeper, a neighbour. May you be well too."]
          ],
          reminders: [
            "Now, if you can, someone you find difficult. May you be free from suffering.",
            "If that's hard, return to yourself for a while. That's okay.",
            "Now everyone in your city.",
            "Everyone in the world. May all beings be well.",
            "May all beings be happy and at ease."
          ]
        }
      ]
    }
  ];

  var byId = {};
  courses.forEach(function (c) {
    c.sessions.forEach(function (s, i) { s.course = c.id; s.index = i; s.color = s.color || c.color; s.face = s.face || c.face; byId[s.id] = s; });
  });

  // Build the timed cues for a session at a chosen length (minutes).
  function cuesFor(s, mins) {
    var total = mins * 60;
    var outro = s.outro || OUTRO;
    var lead = 9; // the lesson's name is spoken first, then the intro begins
    var cues = [{ at: 0, text: "Welcome to today's lesson — " + s.title + "." }];
    s.intro.forEach(function (c) { if (c[0] + lead < total - 20) cues.push({ at: c[0] + lead, text: c[1] }); });
    var introEnd = s.intro.length ? s.intro[s.intro.length - 1][0] + lead + 20 : 0;
    var outroStart = total - Math.max.apply(null, outro.map(function (c) { return c[0]; })) - 10;
    var room = outroStart - introEnd;
    if (s.reminders.length && room > 40) {
      var gap = Math.max(s.gap || 45, room / (s.reminders.length + 1));
      gap = Math.min(gap, s.gap || 120);
      var n = Math.floor(room / gap);
      for (var i = 1; i <= n; i++) cues.push({ at: Math.round(introEnd + i * gap - gap / 2), text: s.reminders[(i - 1) % s.reminders.length] });
    }
    outro.forEach(function (c) { if (total - c[0] > introEnd - 10) cues.push({ at: total - c[0], text: c[1] }); });
    cues.sort(function (a, b) { return a.at - b.at; });
    return cues;
  }

  var GOALS = [
    { id: "calm", label: "Calm", sub: "Settle and breathe", session: "learn-1", mood: "calm" },
    { id: "focus", label: "Focus", sub: "Clear the static", session: "focus-2", mood: "okay" },
    { id: "sleep", label: "Sleep", sub: "Drift off", session: "sleep-1", mood: "flat" },
    { id: "sos", label: "Anxious", sub: "Right now, help", session: "sos-2", mood: "anxious" }
  ];

  // Every line a session can say, at any of its lengths (for recorded voice + offline download).
  function textsFor(s) {
    var seen = {}, out = [];
    s.lens.forEach(function (m) { cuesFor(s, m).forEach(function (c) { if (!seen[c.text]) { seen[c.text] = 1; out.push(c.text); } }); });
    return out;
  }
  function allTexts() {
    var seen = {}, out = [];
    courses.forEach(function (c) { c.sessions.forEach(function (s) { textsFor(s).forEach(function (t) { if (!seen[t]) { seen[t] = 1; out.push(t); } }); }); });
    return out;
  }

  return { courses: courses, byId: byId, cuesFor: cuesFor, goals: GOALS, textsFor: textsFor, allTexts: allTexts };
})();
