-- Fixed-window per-user rate limiting for expensive endpoints (AI, bank auth).
CREATE TABLE rate_limits (
    user_email TEXT NOT NULL,
    route TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_email, route, window_start)
);
