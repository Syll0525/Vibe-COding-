# ⏰ Daily Reminders

A small reminder app that runs in your browser. No install, no account, no server.

- **Reminders.** Add a task with a date and time. When it's due you get a desktop/phone notification, a chime, and a banner in the app with **Done** and **Snooze 10 min** buttons.
- **Repeats.** Tasks can be once, every day, weekdays only, or every week. Ticking a repeating task schedules the next one.
- **Tick off tasks.** Tasks are grouped into Overdue, Today, Upcoming and Done today.
- **Daily notes.** Each day has a "What I learned" note that saves as you type. The same page lists the tasks you finished that day. Page back through old days, search past notes, and keep a note streak going.
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
