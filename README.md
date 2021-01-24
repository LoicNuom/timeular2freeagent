# Timeular to Freeagent

This is a CLI made in node to save timeular time entries to Freeagent

## How to Setup
You will need to set the environment variables:

from [https://profile.timeular.com/#/app/account](https://profile.timeular.com/#/app/account)
- TIMEULAR_API_KEY
- TIMEULAR_API_SECRET

from [https://dev.freeagent.com/apps/](https://dev.freeagent.com/apps/)
- FREEAGENT_IDENTIFIER
- FREEAGENT_SECRET

You will need to add http://localhost:3000/oauth to the freeagent OAuth redirect URIs

- install the dependencies:
```
npm install
or
yarn
```

## How to run
just run 
``` 
npm start
or 
yarn start
``` 

Steps:
- Loads the activities taken this week
- ask which activity you want to export (has to be done 1 by 1)
- We now need to match the Timeular Activity to the right Freeagent Project:
    - Choose a Client from the list (It might have multiple pages of clients)
    - Choose a Project from this client
    - Choose a Task from this project
- It will now save all the matching entries from timeular to freeagent


## Future Development
Save the matchings from timeular to freeagent and don't ask for them again.

Do a web or desktop GUI