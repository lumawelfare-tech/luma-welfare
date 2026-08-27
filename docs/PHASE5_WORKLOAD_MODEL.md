# LUMA WELFARE — PHASE 5: WORKLOAD MODEL
# Realistic concurrency and traffic estimation for 500K+ registered users

## Capacity Model

### User Segmentation

| Metric                        | Value   | Rationale                                      |
|-------------------------------|---------|------------------------------------------------|
| Registered members            | 500,000 | Target scale                                   |
| Monthly active users (MAU)    | 100,000 | 20% — welfare apps have moderate engagement     |
| Daily active users (DAU)      | 15,000  | 15% of MAU — members check periodically         |
| Peak concurrent users         | 750     | 5% of DAU — morning/evening peak               |
| Admin users                   | 20      | Fixed small team                               |
| Background workers            | 2-3     | Export worker, scheduled reports                |

### Request Volume Estimates (Peak Hour)

| User Journey              | Requests/User | Concurrent Users | Requests/Second |
|---------------------------|:------------:|:---------------:|:--------------:|
| Login + Dashboard         | 8            | 750             | ~17            |
| Member Search (admin)     | 3            | 5               | ~0.4           |
| Contribution History      | 2            | 200             | ~1.1           |
| Claims View               | 2            | 100             | ~0.6           |
| Notifications Poll        | 1            | 750             | ~2.1           |
| Package Browse            | 3            | 300             | ~2.5           |
| Report Generation         | 5            | 3               | ~0.4           |
| Export Job                | 10           | 2               | ~0.6           |
| **Total Peak**            |              |                 | **~25 rps**    |

### Database Operations Per Request

| Endpoint              | DB Ops | Notes                                    |
|-----------------------|:------:|------------------------------------------|
| member-dashboard      | 2-3    | RPC + registration fee check             |
| admin-dashboard       | 5-7    | Summary RPC + chart data + breakdowns    |
| admin-members (list)  | 2      | Count + paginated select                 |
| admin-members (search)| 2      | Count + filtered select with trigram     |
| contributions (list)  | 1-2    | Select with joins                        |
| claims (list)         | 1-2    | Select with joins                        |
| notifications         | 1-2    | Select + optional unread count           |
| reports (KPI)         | 3-5    | RPC calls in parallel                    |
| export (create)       | 2      | Insert job + check concurrency           |
| export (worker)       | 50-200 | Batched cursor reads + upload            |

### Data Growth Projections

| Table            | At 12K Users | At 100K Users | At 500K Users |
|------------------|:------------:|:-------------:|:-------------:|
| members          | 12,000       | 100,000       | 500,000       |
| subscriptions    | 18,000       | 150,000       | 750,000       |
| contributions    | 108,000      | 900,000       | 4,500,000     |
| claims           | 2,400        | 20,000        | 100,000       |
| payments         | 108,000      | 900,000       | 4,500,000     |
| notifications    | 50,000       | 400,000       | 2,000,000     |
| audit_logs       | 100,000      | 800,000       | 4,000,000     |
| registration_fees| 12,000       | 100,000       | 500,000       |

### Assumptions

1. **Not all 500K users are active simultaneously.** Realistic peak is ~750 concurrent.
2. **Admin traffic is lightweight.** 20 admins × 5 requests/minute = ~2 rps.
3. **Background exports are the heaviest load.** Each export reads 500K rows in batches.
4. **Financial data integrity is paramount.** No approximation for money.
5. **RLS adds ~5-15% overhead** on member-facing queries (acceptable).
