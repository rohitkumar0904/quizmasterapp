# 📚 Project Database Documentation

A comprehensive reference for the Supabase PostgreSQL schema — covering all tables, relationships, RLS policies, and usage patterns.

---

## Table of Contents

- [Overview](#overview)
- [Schema Diagram](#schema-diagram)
- [Tables](#tables)
  - [profiles](#profiles)
  - [folders](#folders)
  - [quizzes](#quizzes)
  - [quiz_attempts](#quiz_attempts)
  - [quiz_sessions](#quiz_sessions)
  - [bookmarks](#bookmarks)
  - [notes](#notes)
  - [friendships](#friendships)
  - [inbox_messages](#inbox_messages)
  - [pins](#pins)
  - [likes](#likes)
  - [groups](#groups)
  - [pomo_races](#pomo_races)
  - [pomo_race_progress](#pomo_race_progress)
  - [pomo_race_chat](#pomo_race_chat)
- [Row Level Security (RLS)](#row-level-security-rls)
- [Key Relationships](#key-relationships)

---

## Overview

This project uses **Supabase** (PostgreSQL) as its backend database. The schema is organized around a quiz/study platform with the following core feature areas:

| Feature Area | Tables Involved |
|---|---|
| User identity | `profiles` |
| Content organization | `folders`, `groups` |
| Quiz management | `quizzes`, `quiz_attempts`, `quiz_sessions` |
| Social features | `friendships`, `inbox_messages`, `likes` |
| Personal utilities | `bookmarks`, `notes`, `pins` |
| Live race mode | `pomo_races`, `pomo_race_progress`, `pomo_race_chat` |

---

## Schema Diagram

```
auth.users
    │
    └──► profiles (id)
              │
              ├──► groups
              ├──► folders (user_id) ◄── parent_id (self-ref) ◄── group_id
              ├──► quizzes (user_id) ◄── folder_id
              │         │
              │         └──► quiz_attempts ◄── session_id (quiz_sessions)
              │         └──► bookmarks
              │
              ├──► notes
              ├──► friendships (requester_id / addressee_id)
              ├──► inbox_messages (to_user_id / from_user_id)
              ├──► pins
              ├──► likes
              └──► quiz_sessions (host_id)

pomo_races (room_code)
    ├──► pomo_race_progress
    └──► pomo_race_chat
```

---

## Tables

---

### `profiles`

Stores public user profile data. Linked 1:1 with `auth.users`.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | — | PK, FK → `auth.users(id)` |
| `display_name` | `text` | `'User'` | Display name shown in UI |
| `roll_no` | `text` | — | Unique student roll number |
| `is_public` | `boolean` | `true` | Controls profile visibility |
| `theme` | `text` | `'light'` | UI theme preference (`light` / `dark`) |
| `created_at` | `timestamptz` | `now()` | Record creation timestamp |

**Policies:** `profiles_insert`, `profiles_insert_own`, `profiles_select`, `profiles_update`, `profiles_update_own`

---

### `folders`

Organizes quizzes into a nested folder hierarchy. Supports groups and public sharing.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles(id)` |
| `name` | `text` | — | Folder name |
| `is_public` | `boolean` | `false` | Whether folder is publicly visible |
| `is_pinned` | `boolean` | `false` | Pin to top of list |
| `created_at` | `timestamptz` | `now()` | — |
| `updated_at` | `timestamptz` | `now()` | — |
| `parent_id` | `uuid` | `NULL` | FK → `folders(id)` (self-referential, for nesting) |
| `group_name` | `text` | `NULL` | Display name for the group |
| `group_id` | `uuid` | `NULL` | FK → `groups(id)` |

**Notes:** `parent_id` enables unlimited nesting depth. `group_id` links folders to a user-defined group.

**Policies:** `folders_select`, `folders_insert`, `folders_insert_own`, `folders_update`, `folders_update_own`, `folders_delete`, `folders_delete_own`, `public folders are readable`

---

### `quizzes`

Core content table. Stores quiz metadata and all questions as JSONB.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `folder_id` | `uuid` | `NULL` | FK → `folders(id)` (optional) |
| `user_id` | `uuid` | — | FK → `profiles(id)` |
| `title` | `text` | — | Quiz title |
| `questions` | `jsonb` | `'[]'` | Array of question objects |
| `is_public` | `boolean` | `false` | Whether quiz is publicly accessible |
| `is_pinned` | `boolean` | `false` | Pin to top of list |
| `created_at` | `timestamptz` | `now()` | — |
| `updated_at` | `timestamptz` | `now()` | — |

**`questions` JSONB structure (per item):**
```json
{
  "text": "What is the capital of France?",
  "options": ["Berlin", "Paris", "Rome", "Madrid"],
  "correct_index": 1,
  "explanation": "Paris is the capital and largest city of France."
}
```

**Policies:** `quizzes_select`, `quizzes_insert`, `quizzes_insert_own`, `quizzes_update`, `quizzes_update_own`, `quizzes_delete`, `quizzes_delete_own`, `public quizzes are readable`, `shared quiz readable by recipients`

---

### `quiz_attempts`

Records every quiz attempt made by a user, including score, answers, and time taken.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles(id)` |
| `quiz_id` | `uuid` | `NULL` | FK → `quizzes(id)` (nullable if quiz deleted) |
| `quiz_title` | `text` | — | Snapshot of quiz title at time of attempt |
| `score` | `integer` | `0` | Number of correct answers |
| `total` | `integer` | `0` | Total number of questions |
| `answers` | `jsonb` | `'{}'` | Map of question index → selected option index (see below) |
| `time_taken` | `integer` | `0` | Time taken in seconds |
| `attempted_at` | `timestamptz` | `now()` | Timestamp of attempt |
| `session_id` | `uuid` | `NULL` | FK → `quiz_sessions(id)` (if part of a live session) |

**`answers` JSONB structure:**

A flat object where each key is the **question index** (0-based, as a string) and the value is the **selected option index** (0-based integer).

```json
{ "0": 2, "1": 0, "2": 1 }
```

| Key | Value | Description |
|---|---|---|
| `"0"`, `"1"`, ... | `integer` | Index of the option the user selected for that question |

To check if an answer was correct, compare `answers[i]` against `quizzes.questions[i].correctIndex` (or the snapshot in `pomo_races.sections`).

**Policies:** `attempts_own`, `attempts_insert`, `attempts_select`, `friends can read each others attempts`, `session members can read attempts`

---

### `quiz_sessions`

Live multiplayer quiz sessions. The host creates a session and invites members.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `host_id` | `uuid` | `NULL` | FK → `profiles(id)` |
| `host_name` | `text` | `NULL` | Snapshot of host display name |
| `quiz_id` | `uuid` | `NULL` | Reference to the quiz being used |
| `title` | `text` | `NULL` | Session title |
| `questions` | `jsonb` | `NULL` | Snapshot of quiz questions at session time |
| `time_limit_seconds` | `integer` | `0` | Per-question time limit (`0` = no limit) |
| `member_ids` | `uuid[]` | `'{}'` | Array of participating user IDs |
| `created_at` | `timestamptz` | `now()` | — |

**Policies:** `host can create session`, `session members can read`

---

### `bookmarks`

Saves individual questions from quizzes for later review.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles(id)` |
| `quiz_id` | `uuid` | `NULL` | FK → `quizzes(id)` |
| `question_index` | `integer` | `0` | Index of question within the quiz |
| `question_text` | `text` | — | Snapshot of the question text |
| `created_at` | `timestamptz` | `now()` | — |
| `quiz_title` | `text` | `''` | Snapshot of the quiz title |
| `options` | `jsonb` | `'[]'` | Snapshot of answer options |
| `correct_index` | `integer` | `NULL` | Index of the correct option |
| `explanation` | `text` | `''` | Explanation for the answer |

**Note:** Key fields (`question_text`, `options`, `correct_index`, `explanation`) are snapshots, so bookmarks remain valid even if the original quiz is edited or deleted.

**Policies:** `bookmarks_all`, `bookmarks_own`

---

### `notes`

Free-form personal notes with tag support.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles(id)` |
| `body` | `text` | — | Note content (markdown supported) |
| `tags` | `jsonb` | `'[]'` | Array of tag strings |
| `created_at` | `timestamptz` | `now()` | — |

**Policies:** `notes_all`, `notes_own`

---

### `friendships`

Tracks friend requests and confirmed friendships between users.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `requester_id` | `uuid` | — | FK → `profiles(id)` — user who sent the request |
| `addressee_id` | `uuid` | — | FK → `profiles(id)` — user who received it |
| `status` | `text` | `'pending'` | One of: `pending`, `accepted`, `rejected` |
| `created_at` | `timestamptz` | `now()` | — |
| `updated_at` | `timestamptz` | `now()` | — |

**Status lifecycle:**
```
requester sends request → status: "pending"
addressee accepts       → status: "accepted"
addressee rejects       → status: "rejected"
```

**Policies:** `friendships_select`, `friendships_visible`, `friendships_insert`, `friendships_insert_own`, `friendships_update`, `friendships_update_participant`, `friendships_delete_participant`, `addressee can respond to friend requests`

---

### `inbox_messages`

In-app messaging/notification system for sending quizzes and other content between users.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `to_user_id` | `uuid` | — | FK → `profiles(id)` — recipient |
| `from_user_id` | `uuid` | `NULL` | FK → `profiles(id)` — sender (NULL = system) |
| `type` | `text` | `'quiz'` | Message type (e.g., `quiz`, `notification`) |
| `title` | `text` | — | Message title |
| `body` | `jsonb` | `'{}'` | Message payload — structure depends on `type` (see below) |
| `is_read` | `boolean` | `false` | Read/unread status |
| `created_at` | `timestamptz` | `now()` | — |

**`body` JSONB structure by `type`:**

**`type = "quiz"`** — Sent when a user shares a quiz session with another user:
```json
{
  "quiz_id": "a7253d66-d140-426a-bcca-5548e6f4d865",
  "session_id": "ff5b93f7-36fc-4070-a11d-e8186c4728ca",
  "time_limit_seconds": 0
}
```

| Field | Type | Description |
|---|---|---|
| `quiz_id` | `uuid` | The quiz being shared |
| `session_id` | `uuid` | The `quiz_sessions` row the recipient should join |
| `time_limit_seconds` | `integer` | Per-question time limit (`0` = no limit) |

**Policies:** `inbox_select`, `inbox_visible`, `inbox_insert`, `inbox_insert_sender`, `inbox_update`, `inbox_update_receiver`, `inbox_delete_receiver`

---

### `pins`

Allows users to pin any item (quiz, folder, etc.) for quick access.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles(id)` |
| `item_type` | `text` | — | Type of pinned item (e.g., `quiz`, `folder`) |
| `item_id` | `uuid` | — | ID of the pinned item |
| `item_name` | `text` | — | Display name of the pinned item |
| `item_meta` | `text` | `''` | Optional metadata string |
| `created_at` | `timestamptz` | `now()` | — |

**Policies:** `pins_all`, `pins_own`

---

### `likes`

Generic like/reaction system for any item type.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles(id)` |
| `item_type` | `text` | — | Type of liked item (e.g., `quiz`, `folder`) |
| `item_id` | `uuid` | — | ID of the liked item |
| `created_at` | `timestamptz` | `now()` | — |

**Policies:** `likes_select`, `likes_insert`, `likes_insert_own`, `likes_delete`, `likes_delete_own`

---

### `groups`

User-defined groups for organizing folders.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | — | FK → `auth.users(id)` |
| `name` | `text` | — | Group name |
| `sort_order` | `integer` | `0` | Display order |
| `created_at` | `timestamptz` | `now()` | — |

**Policies:** `groups_all`

---

### `pomo_races`

Pomodoro-style competitive race rooms. Players race through quiz sections together.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `room_code` | `text` | — | **Unique** short code for joining the room |
| `quiz_id` | `text` | — | ID of the quiz being used |
| `quiz_title` | `text` | `''` | Display title of the quiz |
| `settings` | `jsonb` | `'{}'` | Race configuration (timers, modes, etc.) |
| `sections` | `jsonb` | `'[]'` | Array of quiz sections |
| `total_sections` | `integer` | `1` | Total number of sections in the race |
| `created_by` | `text` | — | Player ID of room creator |
| `created_at` | `timestamptz` | `now()` | — |
| `expires_at` | `timestamptz` | `now() + 2h` | Room auto-expires after 2 hours |

**`settings` JSONB structure:**
```json
{
  "studyTimeMinutes": 25,
  "breakTimeMinutes": 5,
  "quizTimeMinutes": 20,
  "questionsPerSection": 15,
  "autoAdvance": true
}
```

| Field | Type | Description |
|---|---|---|
| `studyTimeMinutes` | `integer` | Duration of the study/reading phase per section (minutes) |
| `breakTimeMinutes` | `integer` | Break duration between sections (minutes) |
| `quizTimeMinutes` | `integer` | Time allowed for the quiz phase per section (minutes) |
| `questionsPerSection` | `integer` | How many questions are in each section; determines how the quiz is split |
| `autoAdvance` | `boolean` | Whether the room auto-advances to the next section when time runs out |

**`sections` JSONB structure:**

An array of arrays — each inner array is one section containing `questionsPerSection` question objects.

```json
[
  [
    {
      "id": "q1",
      "question": "Q-1. What is the cube of 5?",
      "options": ["125", "150", "100", "175"],
      "correctIndex": 0,
      "explanation": "5 × 5 × 5 = 125"
    },
    { "id": "q2", "..." : "..." }
  ],
  [
    { "id": "q16", "..." : "..." }
  ]
]
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Question identifier (e.g. `"q1"`, `"q16"`) |
| `question` | `string` | Question text (may include a display label like `"Q-1."`) |
| `options` | `string[]` | Array of 4 answer choices |
| `correctIndex` | `integer` | 0-based index into `options` pointing to the correct answer |
| `explanation` | `string` | Shown after the answer is submitted |

**How sections are built:** The original quiz questions are sliced into chunks of `questionsPerSection`. So a 56-question quiz with `questionsPerSection: 15` produces 4 sections (15 + 15 + 15 + 11).

**Policies:** `pomo_races_all`

---

### `pomo_race_progress`

Tracks each player's real-time progress within a pomo race room.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `room_code` | `text` | — | FK → `pomo_races(room_code)` |
| `player_id` | `text` | — | Player identifier |
| `player_name` | `text` | `'Racer'` | Display name |
| `phase` | `text` | `'waiting'` | Current phase: `waiting`, `studying`, `quiz`, `done` |
| `current_section` | `integer` | `0` | Which section the player is on |
| `total_sections` | `integer` | `1` | Total sections in race |
| `accuracy` | `numeric` | `0` | Quiz accuracy percentage (0–100) |
| `correct` | `integer` | `0` | Number of correct answers |
| `total_answered` | `integer` | `0` | Total questions answered |
| `time_elapsed` | `integer` | `0` | Time elapsed in seconds |
| `updated_at` | `timestamptz` | `now()` | Last updated (used for real-time sync) |

**Policies:** `pomo_progress_all`

---

### `pomo_race_chat`

Chat messages within a pomo race room.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `room_code` | `text` | — | FK → `pomo_races(room_code)` |
| `player_id` | `text` | — | Sender's player ID |
| `player_name` | `text` | `''` | Sender's display name |
| `type` | `text` | `'msg'` | Message type: `msg`, `system`, `emoji` |
| `content` | `text` | `''` | Message content |
| `created_at` | `timestamptz` | `now()` | — |

**Policies:** `pomo_chat_all`

---

## Row Level Security (RLS)

All tables have RLS **enabled**. The general access pattern is:

| Policy Pattern | Description |
|---|---|
| `*_own` | User can only access/modify their own rows (`user_id = auth.uid()`) |
| `*_all` | Full CRUD for authenticated users on their own data |
| `public * are readable` | Anyone (including anon) can SELECT rows where `is_public = true` |
| `friends can read *` | Users can read data belonging to confirmed friends |
| `session members can read *` | Users in a `quiz_sessions.member_ids` array can read related data |
| `*_select / *_visible` | Broader read access for specific conditions |
| `addressee can respond` | Only the receiving user can update a friendship status |
| `inbox_*_receiver` | Only the recipient can mark messages read or delete them |

---

## Key Relationships

```
profiles          1 ──► N   folders
profiles          1 ──► N   quizzes
profiles          1 ──► N   quiz_attempts
profiles          1 ──► N   bookmarks
profiles          1 ──► N   notes
profiles          1 ──► N   friendships   (as requester OR addressee)
profiles          1 ──► N   inbox_messages (as sender OR receiver)
profiles          1 ──► N   pins
profiles          1 ──► N   likes
profiles          1 ──► N   groups
profiles          1 ──► N   quiz_sessions (as host)

folders           N ──► 1   folders       (parent_id self-reference)
folders           N ──► 1   groups

quizzes           1 ──► N   quiz_attempts
quizzes           1 ──► N   bookmarks

quiz_sessions     1 ──► N   quiz_attempts (session_id)

pomo_races        1 ──► N   pomo_race_progress
pomo_races        1 ──► N   pomo_race_chat
```

---

*Generated from Supabase schema — `public` schema, all tables with RLS enabled.*
