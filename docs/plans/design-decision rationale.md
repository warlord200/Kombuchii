## These are the design rationale to aid myself/external readers

## Theorecticals (Brainstorming)

- Hard part: Exactly when is the biggest trap. Temps + forecast = "exact" date doesnt really work
- Other words: keep 30% starter (safe, slower batch) OR keep 12% starter (more to drink,higher mold risk)
- It needs to recalliberate whenever temperature changes
- Mold is probabilistic rather than deterministic
- This means even when starter is 25%>, it might still have mold
- This task is more of an optimization problem rather than prediction
- Rather than a date, we need a window
- Since "finish" isnt fixed, it is also a window
- Starter amount doesnt change speed that much (it is relevant but it is diminishing returns)

#### Defining rate 
- Prediction model: rate * temperature factor * starter factor and pH
- Recalculation daily
- Alternatively, we can use a empirical table from homebrew literature
- This isnt as tunable as prediction model 


## Technicals
### Why web-app over app?
- No download needed
- Need to build apps
- However less convinient from user POV
- Notification system works less well too

### Tech-stack
- 

### How temperature is measure
- Room but like for simplicity its outdoor - user-set
- We can just change the API

### How is pH calculated
- model predict 
- optionally, you can test them yourself and it self-optimizes

### Why SQlite over other database

- Default is Postgres but theres a server process and auth and networking 
- Since this is self-hosted, and we're dealing with relatively small amount of data, QLite it is
- We are doing a relational store for the batch (so no document-store like MongoDB)

### Why use Prisma

- 