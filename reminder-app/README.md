# ⏰ Daily Reminders

A small reminder app that runs in your browser. No install, no account, no server.

- **Reminders.** Add a task with a date, time and optional **location** (📍 shown on the task and in the notification, with a link to open it in maps). When it's due you get a desktop/phone notification, a chime, and a banner in the app with **Done** and **Snooze 10 min** buttons.
- **Repeats.** Tasks can be once, every day, weekdays only, or every week. Ticking a repeating task schedules the next one.
- **Tick off tasks.** Tasks are grouped into Overdue, Today, Upcoming and Done today.
- **Daily notes.** Each day has a "What I learned" note that saves as you type. The same page lists the tasks you finished that day. Page back through old days, search past notes, and keep a note streak going.
- **Pet buddy.** A cosy pixel-art café street where your buddy lives. Pick one of 5 characters (Hamster, Bear, Bunny, Kitty, Chick) and give it a name.
  - Earn 🪙 **10 coins** for each task ticked on time (up to 1 hour late), 🪙 5 if later, and 🪙 5 for writing today's note.
  - Spend coins in the **Shop**: snacks (feed your buddy), outfits (bow, daisy, party hat, beret, crown, shades, scarf, café apron), street decor (umbrella table, bench, lamps, tree, bush, menu board, sunflower, rooftop garden, a little bird) and sunset/night skies.
  - Your buddy gets hungry and lonely over about a day. **Feed**, **Pat** (or tap the scene) and **Play** to keep it happy. It sleeps from 10pm to 7am.
- **Your buddy says hi.** Every time you open the app (or come back after 10+ minutes) your buddy waves, says hello, and cheers you on based on your day: "I saw you finished all 3 tasks today. Good job! 🎉". It asks how your day is going (😄 Great / 🙂 Okay / 😴 Tired / 😣 Stressed) and answers kindly.
- **Jobs.** Pick one of 5 cute jobs: ☕ Barista, 🥐 Baker, 🍹 Mocktail mixer, 💐 Florist, 📚 Librarian. Each job has its own hat or glasses, a prop, and things in the shop window.
- **"My day?"** Tap it and your buddy reads you its diary for today or yesterday: the work it did at its job, the tasks you finished, snacks, pats, your mood, and the coins you earned.
- **Calendar.** Pick a date and a time for each task. Switch the task list to 📅 Calendar to see the month, tap a day to see its tasks or add one on that day.
- **Choose when to be reminded.** For each task pick any of: at the time, 10 min, 30 min, 1 hour, 2 hours, or 1 day before. In 🔔 Reminder settings choose the defaults, a ☀️ morning plan (today's tasks) and a 🌙 evening check-in, each at the time you want. "Send a test reminder" checks it works.
- **Backup.** Export everything to a JSON file and import it on another browser.

## How to open it

**Quickest:** double-click `index.html`. Everything works, except the notification buttons (Done/Snooze inside the notification itself), which need the page served over http.

**Recommended** (full notifications, and you can "Install" it as an app in Chrome/Edge):

```bash
cd reminder-app
python3 -m http.server 8080
# then open http://localhost:8080
```

Click **Turn on notifications** once and allow it when the browser asks.

## Good to know

- Reminders fire while the page is open. A background tab or a minimised window is fine, but if the browser is closed the reminder shows up the next time you open the app (for up to 12 hours).
- Your data lives in this browser's local storage. Clearing site data deletes it, so use **Export backup** now and then.
