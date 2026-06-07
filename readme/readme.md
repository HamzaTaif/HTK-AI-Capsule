# Synapse AI

> Cross-LLM Memory Continuity Platform

Synapse AI is a Chrome Extension that allows users to preserve and transfer conversational context between different AI platforms such as ChatGPT, Gemini, Claude, Perplexity, and future LLMs.

Instead of manually re-explaining projects, study sessions, coding tasks, research work, or long conversations, users can generate a lightweight semantic memory capsule and continue seamlessly on another AI platform.

---

# Problem

Modern AI users frequently encounter:

- Message limits
- Context window limits
- Platform switching
- Lost project history
- Repeated explanations

A user may spend hours building context with one AI and then lose continuity when switching to another platform.

Current solutions require:
- Copy-pasting conversations
- Uploading files repeatedly
- Re-explaining project goals
- Rebuilding context manually

This creates friction and wastes time.

---

# Solution

Synapse AI introduces the concept of:

### Memory Capsules

A Memory Capsule is a compressed semantic representation of a conversation.

Instead of transferring entire chats, Synapse AI extracts:

- Main topics
- Important concepts
- Current goals
- User preferences
- Unresolved issues
- Workflow state

and packages them into a lightweight capsule.

The capsule can then be injected into another AI platform to restore context and continue naturally.

---

# Key Features

## Semantic Context Extraction

Extracts:

- Project state
- Learning progress
- Coding objectives
- Research goals
- User preferences
- Important concepts

without exporting full conversations.

---

## Cross-LLM Continuity

Supports:

- ChatGPT
- Gemini
- Claude
- Perplexity
- Future LLM platforms

Users can continue conversations across platforms.

---

## Capsule Generation

Generate a reusable context capsule from any supported AI conversation.

Capsules preserve:

- Goals
- Topics
- Concepts
- Learning state
- Workflow continuity

---

## Capsule Injection

Users can inject previously generated capsules into another AI session.

This allows:

- Seamless continuation
- Reduced setup time
- Faster onboarding into existing projects

---

## Local Document Processing

Supports:

- PDF files
- DOCX files
- Notes

Documents are processed locally.

Synapse AI extracts semantic concepts instead of transferring raw files.

---

## Firebase User Accounts

Supports:

- Email Sign Up
- Email Login
- Google Authentication

Each user maintains a personal capsule library.

---

## Cloud Capsule Library

Generated capsules are stored securely in Firestore.

Users can:

- Save capsules
- Reuse capsules
- Organize project memories
- Continue previous sessions

---

# Architecture

## Frontend

- Chrome Extension (Manifest V3)
- HTML
- CSS
- JavaScript

---

## Backend

- Firebase Authentication
- Cloud Firestore

---

## AI Layer

Uses Gemini API for semantic compression and context summarization.

The system minimizes token usage by storing semantic memory rather than full chat exports.

---

# Workflow

```text
User Conversation
        ↓
Context Extraction
        ↓
Semantic Compression
        ↓
Capsule Generation
        ↓
Cloud Storage
        ↓
Capsule Injection
        ↓
Context Restoration
        ↓
Continue Conversation
```

# Authentication

Supported Methods:

- Email & Password
- Google Sign In

Features:

- Persistent Sessions
- User Profiles
- Secure Authentication
- Firestore Integration

---

# User Profile System

Each user receives:

- Profile Avatar
- Personal Information
- Security Settings
- Capsule Library
- Account Management

---

# Security

Synapse AI:

- Stores capsules per authenticated user
- Uses Firebase Authentication
- Uses Firestore security rules
- Does not expose private user data

---

# Future Roadmap

## Smart Capsule Ranking

Automatically recommend relevant capsules based on current conversation.

---

## Team Capsules

Shared memory capsules for teams and organizations.

---

## AI Workspace

Persistent memory workspace across multiple LLMs.

---

## Semantic Search

Search across all previous capsules using natural language.

---

## Multi-Device Sync

Continue conversations across:

- Desktop
- Laptop
- Mobile

---

# Use Cases

## Students

- Continue study sessions
- Preserve learning progress
- Transfer context across AI tools

---

## Developers

- Continue coding projects
- Preserve architecture discussions
- Transfer debugging context

---

## Researchers

- Maintain research continuity
- Organize findings
- Resume investigations quickly

---

## Professionals

- Manage long projects
- Retain business context
- Improve productivity

---

# Project Vision

Synapse AI aims to become the memory layer for AI.

Just as browsers remember bookmarks and history, Synapse AI enables AI systems to remember projects, goals, and workflow state across platforms.

The long-term goal is to create seamless AI continuity where users never need to repeatedly explain themselves to different AI systems.

---

# Built By

Hamza Taif (HTK)

Synapse AI Hackathon Project

Building the future of AI memory continuity.