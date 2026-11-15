# MongoDB Index Definitions

This document details the MongoDB collection indexes and Atlas Vector Search index definitions required for JobPilot.

---

## 1. MongoDB Atlas Vector Search Index

Used when `ATLAS_VECTOR_SEARCH=true` for semantic job retrieval against candidate profile embeddings.

### Collection: `jobs`
- **Index Name**: `job_vector_index`
- **Definition (JSON)**:
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "remote"
    },
    {
      "type": "filter",
      "path": "source"
    }
  ]
}
```

### Pipeline Usage Example
```javascript
[
  {
    $vectorSearch: {
      index: "job_vector_index",
      path: "embedding",
      queryVector: candidateProfileEmbedding,
      numCandidates: 100,
      limit: 50,
      filter: {
        ...(remoteOnly ? { remote: { $eq: true } } : {})
      }
    }
  }
]
```

---

## 2. Standard Compound & Performance Indexes

### `users`
- `{ email: 1 }` (unique)
- `{ createdAt: -1 }`

### `resumes`
- `{ userId: 1, createdAt: -1 }`
- `{ userId: 1, status: 1 }`

### `jobs`
- `{ hash: 1 }` (unique)
- `{ source: 1, externalId: 1 }`
- `{ postedAt: -1 }`
- `{ createdAt: -1 }`
- `{ remote: 1, postedAt: -1 }`

### `matches`
- `{ userId: 1, jobId: 1 }` (unique compound)
- `{ userId: 1, createdAt: -1 }`
- `{ searchId: 1, score: -1 }`
- `{ userId: 1, score: -1 }`

### `applications`
- `{ userId: 1, jobId: 1 }`
- `{ userId: 1, status: 1, order: 1 }`
- `{ userId: 1, createdAt: -1 }`

### `artifacts`
- `{ userId: 1, createdAt: -1 }`
- `{ userId: 1, matchId: 1, type: 1 }`

### `searchruns`
- `{ userId: 1, createdAt: -1 }`

### `llmruns`
- `{ userId: 1, createdAt: -1 }`
- `{ createdAt: -1 }`
