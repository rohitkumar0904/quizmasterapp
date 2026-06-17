# 📚 StudyApp — Database Documentation

A full-featured study platform with quizzes, notes, social features, and real-time multiplayer racing. Built on **Supabase (PostgreSQL)** with Row-Level Security (RLS) enforced on all tables.

---

## Table of Contents

- [Overview](#overview)
- [Schema Diagram](#schema-diagram)
- [Tables](#tables)
  - [profiles](#profiles)
  - [folders](#folders)
  - [quizzes](#quizzes)
  - [quiz\_attempts](#quiz_attempts)
  - [quiz\_sessions](#quiz_sessions)
  - [bookmarks](#bookmarks)
  - [notes](#notes)
  - [groups](#groups)
  - [friendships](#friendships)
  - [inbox\_messages](#inbox_messages)
  - [pins](#pins)
  - [likes](#likes)
  - [pomo\_races](#pomo_races)
  - [pomo\_race\_progress](#pomo_race_progress)
  - [pomo\_race\_chat](#pomo_race_chat)
- [Row-Level Security (RLS)](#row-level-security-rls)
- [Key Relationships](#key-relationships)
- [Design Notes](#design-notes)

---

## Overview

The database powers the following feature areas:

| Feature | Tables Involved |
|---|---|
| User accounts & settings | `profiles` |
| Content organization | `folders`, `groups` |
| Quiz creation & taking | `quizzes`, `quiz_attempts`, `quiz_sessions` |
| Study tools | `bookmarks`, `notes`, `pins` |
| Social layer | `friendships`, `inbox_messages`, `likes` |
| Multiplayer racing | `pomo_races`, `pomo_race_progress`, `pomo_race_chat` |

---

## Schema Diagram

```
auth.users
    │
    └── profiles (1:1)
            │
            ├── groups (1:N)
            │       │
            │       └── folders.group_id (N:1)
            │
            ├── folders (1:N, self-referencing via parent_id)
            │       │
            │       └── quizzes (1:N)
            │               │
            │               ├── quiz_attempts (1:N)
            │               ├── bookmarks (1:N)
            │               └── quiz_sessions (1:N)
            │
            ├── notes (1:N)
            ├── bookmarks (1:N)
            ├── pins (1:N)
            ├── likes (1:N)
            ├── friendships (requester / addressee)
            └── inbox_messages (sender / receiver)
```

---

## Tables

### `profiles`

Extends `auth.users`. Created automatically on user signup. One profile per auth user.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | — | FK → `auth.users.id` (PK) |
| `display_name` | `text` | `'User'` | Public display name |
| `roll_no` | `text` | — | Unique student roll number |
| `is_public` | `boolean` | `true` | Whether the profile is publicly visible |
| `theme` | `text` | `'light'` | UI theme preference (`'light'` or `'dark'`) |
| `created_at` | `timestamptz` | `now()` | Account creation timestamp |

**Constraints:** `roll_no` is `UNIQUE`.

---

### `folders`

Hierarchical content containers. Folders can be nested (via `parent_id`) and optionally belong to a group.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles.id` |
| `name` | `text` | — | Folder display name |
| `is_public` | `boolean` | `false` | Whether the folder is publicly visible |
| `is_pinned` | `boolean` | `false` | Whether the folder is pinned |
| `created_at` | `timestamptz` | `now()` | — |
| `updated_at` | `timestamptz` | `now()` | — |
| `parent_id` | `uuid` | `NULL` | FK → `folders.id` (self-reference for nesting) |
| `group_name` | `text` | `NULL` | Denormalized group label |
| `group_id` | `uuid` | `NULL` | FK → `groups.id` |

---

### `quizzes`

The core content unit. Each quiz stores its questions as a JSONB array.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `folder_id` | `uuid` | `NULL` | FK → `folders.id` (optional) |
| `user_id` | `uuid` | — | FK → `profiles.id` |
| `title` | `text` | — | Quiz title |
| `questions` | `jsonb` | `[]` | Array of question objects |
| `is_public` | `boolean` | `false` | Whether the quiz is discoverable |
| `is_pinned` | `boolean` | `false` | Whether the quiz is pinned |
| `created_at` | `timestamptz` | `now()` | — |
| `updated_at` | `timestamptz` | `now()` | — |

**`questions` JSONB structure (per item):**
```json
{
  "text": "What is the capital of France?",
  "options": ["Berlin", "Madrid", "Paris", "Rome"],
  "correct_index": 2,
  "explanation": "Paris has been the capital since..."
}
```

---

### `quiz_attempts`

Records every quiz attempt by a user. Also supports anonymous/session-based attempts.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles.id` |
| `quiz_id` | `uuid` | `NULL` | FK → `quizzes.id` (nullable if quiz was deleted) |
| `quiz_title` | `text` | — | Denormalized title (preserved after quiz deletion) |
| `score` | `integer` | `0` | Number of correct answers |
| `total` | `integer` | `0` | Total number of questions |
| `answers` | `jsonb` | `{}` | Map of question index → selected answer index |
| `time_taken` | `integer` | `0` | Time taken in seconds |
| `attempted_at` | `timestamptz` | `now()` | — |
| `session_id` | `uuid` | `NULL` | FK → `quiz_sessions.id` (if part of a session) |

---

### `quiz_sessions`

Multiplayer quiz sessions hosted by a user. Member IDs are stored as a UUID array.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `host_id` | `uuid` | `NULL` | FK → `profiles.id` |
| `host_name` | `text` | `NULL` | Denormalized host display name |
| `quiz_id` | `uuid` | `NULL` | FK → `quizzes.id` |
| `title` | `text` | `NULL` | Session title |
| `questions` | `jsonb` | `NULL` | Snapshot of quiz questions at session start |
| `time_limit_seconds` | `integer` | `0` | Per-question time limit (`0` = no limit) |
| `member_ids` | `uuid[]` | `{}` | Array of participant profile IDs |
| `created_at` | `timestamptz` | `now()` | — |

---

### `bookmarks`

Saves individual questions for later review. Stores a full snapshot of the question so bookmarks remain intact even if the source quiz is edited.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles.id` |
| `quiz_id` | `uuid` | `NULL` | FK → `quizzes.id` (nullable) |
| `question_index` | `integer` | `0` | Position of the question in the quiz |
| `question_text` | `text` | — | Full question text snapshot |
| `created_at` | `timestamptz` | `now()` | — |
| `quiz_title` | `text` | `''` | Denormalized quiz title |
| `options` | `jsonb` | `[]` | Answer options snapshot |
| `correct_index` | `integer` | `NULL` | Correct answer index snapshot |
| `explanation` | `text` | `''` | Explanation snapshot |

---

### `notes`

Free-form text notes with tagging support.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles.id` |
| `body` | `text` | — | Note content (supports markdown) |
| `tags` | `jsonb` | `[]` | Array of tag strings, e.g. `["math", "exam"]` |
| `created_at` | `timestamptz` | `now()` | — |

---

### `groups`

Named groups that folders can be organized into. Owned per-user with custom sort ordering.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | — | FK → `auth.users.id` |
| `name` | `text` | — | Group display name |
| `sort_order` | `integer` | `0` | Display order among user's groups |
| `created_at` | `timestamptz` | `now()` | — |

---

### `friendships`

Bidirectional friend relationships with a request/accept flow.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `requester_id` | `uuid` | — | FK → `profiles.id` (who sent the request) |
| `addressee_id` | `uuid` | — | FK → `profiles.id` (who received the request) |
| `status` | `text` | `'pending'` | One of: `'pending'`, `'accepted'`, `'rejected'` |
| `created_at` | `timestamptz` | `now()` | — |
| `updated_at` | `timestamptz` | `now()` | — |

**Flow:** `pending` → `accepted` (or `rejected`) via the addressee.

---

### `inbox_messages`

In-app notification and messaging system. Supports quizzes shared between users and system notifications.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `to_user_id` | `uuid` | — | FK → `profiles.id` (recipient) |
| `from_user_id` | `uuid` | `NULL` | FK → `profiles.id` (sender; NULL for system messages) |
| `type` | `text` | `'quiz'` | Message type, e.g. `'quiz'`, `'system'` |
| `title` | `text` | — | Message subject/title |
| `body` | `jsonb` | `{}` | Structured message payload |
| `is_read` | `boolean` | `false` | Read status |
| `created_at` | `timestamptz` | `now()` | — |

---

### `pins`

Generic pinning system for any content type. Unlike `is_pinned` on individual tables, this enables cross-type pin lists.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles.id` |
| `item_type` | `text` | — | e.g. `'quiz'`, `'folder'`, `'note'` |
| `item_id` | `uuid` | — | ID of the pinned item |
| `item_name` | `text` | — | Display name of the pinned item |
| `item_meta` | `text` | `''` | Additional metadata string |
| `created_at` | `timestamptz` | `now()` | — |

---

### `likes`

Generic like/reaction system for any content type.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | — | FK → `profiles.id` |
| `item_type` | `text` | — | e.g. `'quiz'`, `'folder'` |
| `item_id` | `uuid` | — | ID of the liked item |
| `created_at` | `timestamptz` | `now()` | — |

---

### `pomo_races`

A Pomodoro-style multiplayer race room. Players race through quiz sections in real time. Rooms expire automatically after 2 hours.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `room_code` | `text` | — | Short unique join code (e.g. `"ABC123"`) — `UNIQUE` |
| `quiz_id` | `text` | — | Reference to the source quiz |
| `quiz_title` | `text` | `''` | Denormalized quiz title |
| `settings` | `jsonb` | `{}` | Race configuration (timers, section sizes, etc.) |
| `sections` | `jsonb` | `[]` | Array of question sections |
| `total_sections` | `integer` | `1` | Total number of sections in the race |
| `created_by` | `text` | — | Display name or ID of room creator |
| `created_at` | `timestamptz` | `now()` | — |
| `expires_at` | `timestamptz` | `now() + 2h` | Auto-expiry timestamp |

---

### `pomo_race_progress`

Tracks each player's live progress within a race room.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `room_code` | `text` | — | FK → `pomo_races.room_code` |
| `player_id` | `text` | — | Player identifier (can be anonymous) |
| `player_name` | `text` | `'Racer'` | Display name |
| `phase` | `text` | `'waiting'` | Current phase: `'waiting'`, `'studying'`, `'quizzing'`, `'done'` |
| `current_section` | `integer` | `0` | Section currently being worked on |
| `total_sections` | `integer` | `1` | Mirror of race total (for display) |
| `accuracy` | `numeric` | `0` | Running accuracy percentage |
| `correct` | `integer` | `0` | Cumulative correct answers |
| `total_answered` | `integer` | `0` | Cumulative questions answered |
| `time_elapsed` | `integer` | `0` | Total seconds elapsed |
| `updated_at` | `timestamptz` | `now()` | Last update (used for live sync) |

---

### `pomo_race_chat`

In-room chat messages for a race. Supports regular messages and system event messages.

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | PK |
| `room_code` | `text` | — | FK → `pomo_races.room_code` |
| `player_id` | `text` | — | Sender identifier |
| `player_name` | `text` | `''` | Sender display name |
| `type` | `text` | `'msg'` | `'msg'` for chat, `'event'` for system events |
| `content` | `text` | `''` | Message text |
| `created_at` | `timestamptz` | `now()` | — |

---

## Row-Level Security (RLS)

All tables have RLS enabled. The Data API is disabled on all tables (direct client access goes through the Supabase JS client with the anon/service key).

### Access patterns by table

| Table | Own Data | Public Data | Friends | Session Members |
|---|---|---|---|---|
| `profiles` | Read + Write own | Read public profiles | — | — |
| `folders` | Full CRUD | Read public folders | — | — |
| `quizzes` | Full CRUD | Read public quizzes | — | Read if shared via inbox |
| `quiz_attempts` | Full CRUD | — | Read friends' attempts | Read session members' attempts |
| `quiz_sessions` | Host: INSERT | — | — | Members: SELECT |
| `bookmarks` | Full CRUD | — | — | — |
| `notes` | Full CRUD | — | — | — |
| `groups` | Full CRUD | — | — | — |
| `friendships` | INSERT (request) | — | UPDATE (accept/reject) | — |
| `inbox_messages` | SELECT + UPDATE (receiver), DELETE (receiver) | — | — | — |
| `pins` | Full CRUD | — | — | — |
| `likes` | INSERT + DELETE | SELECT all | — | — |
| `pomo_races` | Full CRUD (open) | — | — | — |
| `pomo_race_progress` | Full CRUD (open) | — | — | — |
| `pomo_race_chat` | Full CRUD (open) | — | — | — |

> **Note:** `pomo_*` tables use open policies (`pomo_races_all`, `pomo_progress_all`, `pomo_chat_all`) — access is controlled at the application layer via room codes rather than RLS user checks.

---

## Key Relationships

```
profiles
  ├─< folders          (user_id)
  │     └─< quizzes    (folder_id)
  ├─< quizzes          (user_id)  ← quizzes can exist without a folder
  ├─< quiz_attempts    (user_id)
  ├─< bookmarks        (user_id)
  ├─< notes            (user_id)
  ├─< groups           (user_id)
  ├─< pins             (user_id)
  ├─< likes            (user_id)
  ├─< friendships      (requester_id / addressee_id)
  └─< inbox_messages   (to_user_id / from_user_id)

folders
  └─ parent_id → folders  (self-referencing, unlimited nesting depth)
  └─ group_id  → groups

quizzes
  └─< quiz_attempts    (quiz_id)
  └─< bookmarks        (quiz_id)
  └─< quiz_sessions    (quiz_id)

quiz_sessions
  └─< quiz_attempts    (session_id)

pomo_races (room_code)
  ├─< pomo_race_progress  (room_code)
  └─< pomo_race_chat      (room_code)
```

---

## Design Notes

**Denormalization for resilience** — `quiz_attempts` stores `quiz_title`, and `bookmarks` stores a full question snapshot. This preserves historical data if the source quiz is edited or deleted.

**Generic item tables** — `pins` and `likes` use a (`item_type`, `item_id`) pattern rather than separate foreign keys, making it easy to add new content types without schema changes.

**Pomo races use text IDs** — `pomo_race_progress.player_id` and `pomo_races.created_by` are `text` (not `uuid`) to support anonymous/guest players who are not authenticated Supabase users.

**`quiz_sessions` uses a UUID array** — `member_ids uuid[]` stores participants as a Postgres array. Useful for quick membership checks (`ANY`) but not individually indexed; keep session sizes reasonable.

**Folder groups are denormalized** — `folders.group_name` duplicates data from `groups.name`. Ensure updates to `groups.name` are propagated to `folders.group_name` at the application layer.
