#!/usr/bin/env node
import axios from 'axios'
import { DateTime } from 'luxon'
import express from 'express'
import open from 'open'
import fs from 'fs'
import yargs from 'yargs'

require('dotenv').config()
const timeularendpoint = 'https://api.timeular.com/api/v3/'

const freeagentConfig = {
  authorizationURL: 'https://api.freeagent.com/v2/approve_app',
  tokenURL: 'https://api.freeagent.com/v2/token_endpoint',
  baseURL: 'https://api.freeagent.com/v2/',
  appKey: process.env.FREEAGENT_IDENTIFIER as string,
  appSecret: process.env.FREEAGENT_SECRET as string,
}

async function signIn(apiKey: string, apiSecret: string) {
  const response = await axios.post(timeularendpoint + 'developer/sign-in', {
    apiKey,
    apiSecret,
  })

  return response.data.token
}

async function listActivities(token: string) {
  try {
    const response = await axios.get(timeularendpoint + 'activities', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.data
  } catch (err) {
    console.error(err)
    return err.message
  }
}

async function weeklyEntries(token: string) {
  const start = DateTime.fromMillis(Date.now())
    .startOf('week')
    .toISO()
    .split('+')[0]
  const end = DateTime.fromMillis(Date.now())
    .endOf('week')
    .toISO()
    .split('+')[0]

  console.log(`start ${start}, end ${end}`)
  const timeframe = `${start}/${end}`
  const response = await axios.get(
    timeularendpoint + 'time-entries' + '/' + timeframe,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  return response.data
}

async function previousWeekEntries(token: string) {
  const start = DateTime.fromMillis(Date.now())
    .minus({ days: 7 })
    .startOf('week')
    .toISO()
    .split('+')[0]
  const end = DateTime.fromMillis(Date.now())
    .minus({ days: 7 })
    .endOf('week')
    .toISO()
    .split('+')[0]

  console.log(`start ${start}, end ${end}`)
  const timeframe = `${start}/${end}`
  const response = await axios.get(
    timeularendpoint + 'time-entries' + '/' + timeframe,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  return response.data
}

async function main() {
  try {
    const token = await signIn(
      process.env.TIMEULAR_API_KEY as string,
      process.env.TIMEULAR_API_SECRET as string
    )
    console.log(token)
    const activities = await listActivities(token)
    //console.log(activities.activities)

    fs.writeFileSync(
      'exports/timeularActivities.json',
      JSON.stringify(activities.activities, null, 2)
    )

    const entries = await weeklyEntries(token)
    //console.log(entries.timeEntries)

    fs.writeFileSync(
      'exports/timeularWeek.json',
      JSON.stringify(entries.timeEntries, null, 2)
    )

    const freeagentToken = await connectFreeAgent()

    const freeagentProjects = await listFreeAgentProjects(
      freeagentToken['access_token']
    )
    fs.writeFileSync(
      'exports/freeAgentProjects.json',
      JSON.stringify(freeagentProjects.projects, null, 2)
    )
  } catch (err) {
    console.error(err)
  }
}

async function connectFreeAgent() {
  const app = express()

  let resolve: any
  const authorisationPromise = new Promise(_resolve => {
    resolve = _resolve
  })

  app.get('/oauth', function (req, res) {
    resolve(req.query.code)
    res.end('')
  })
  const server = await app.listen(3000)

  const redirect = encodeURIComponent('http://localhost:3000/oauth')
  await open(
    `${freeagentConfig.authorizationURL}?client_id=${freeagentConfig.appKey}&response_type=code&redirect_uri=${redirect}`
  )

  const code = await authorisationPromise

  const res = await axios.post(
    freeagentConfig.tokenURL,
    `grant_type=authorization_code&client_id=${freeagentConfig.appKey}&client_secret=${freeagentConfig.appSecret}&code=${code}&redirect_uri=${redirect}`
  )
  console.log(res.data)
  const token = res.data

  await server.close()

  return processToken(token)
}

interface Token {
  access_token: string
  token_type: string
  expires_in: string
  refresh_token: string
  refresh_token_expires_in: string
}

function processToken(token: Token) {
  const newToken = { ...token }
  if (!isNaN(Number(token.expires_in))) {
    newToken.expires_in = DateTime.fromMillis(Date.now())
      .plus({ seconds: Number(token.expires_in) })
      .toISO()
  }
  if (!isNaN(Number(token.refresh_token_expires_in))) {
    newToken.refresh_token_expires_in = DateTime.fromMillis(Date.now())
      .plus({ seconds: Number(token.refresh_token_expires_in) })
      .toISO()
  }
  return newToken
}

async function refreshToken(refresh_token: string) {
  const res = await axios.post(
    freeagentConfig.tokenURL,
    `grant_type=refresh_token&refresh_token${refresh_token}`
  )

  return processToken(res.data)
}

async function checkFreeAgentToken(
  path: string = 'exports/freeagentToken.json'
): Promise<Token> {
  if (!fs.existsSync(path)) {
    const freeagentToken = await connectFreeAgent()
    fs.writeFileSync(path, JSON.stringify(freeagentToken, null, 2))
    return freeagentToken
  }

  const tokens: Token = JSON.parse(fs.readFileSync(path).toString())

  console.log(tokens)
  const currentDate = DateTime.fromMillis(Date.now())
  const refreshExpiry = DateTime.fromISO(tokens.refresh_token_expires_in)
  const tokenExpiry = DateTime.fromISO(tokens.expires_in)

  if (currentDate > tokenExpiry) {
    const freeagentToken = await connectFreeAgent()
    fs.writeFileSync(path, JSON.stringify(freeagentToken, null, 2))
    return freeagentToken
  }

  if (currentDate > tokenExpiry) {
    const freeagentToken = await refreshToken(tokens.refresh_token)
    fs.writeFileSync(path, JSON.stringify(freeagentToken, null, 2))
    return freeagentToken
  }

  return tokens
}

async function listFreeAgentProjects(token: string) {
  const response = await axios.get(
    freeagentConfig.baseURL +
      'projects?view=active&sort=-updated_at&per_page=100',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )
  return response.data
}

async function listFreeAgentContactProjects(token: string, contactId: string) {
  const response = await axios.get(
    `${freeagentConfig.baseURL}projects?contact=${contactId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )
  return response.data
}

async function listFreeAgentContacts(token: string) {
  const response = await axios.get(
    freeagentConfig.baseURL + 'contacts?view=active&per_page=100',
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )
  return response.data
}

async function getFreeAgentUSer(token: string) {
  const response = await axios.get(freeagentConfig.baseURL + 'users/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return response.data
}

async function listProjectTasks(token: string, projectId: string) {
  const response = await axios.get(
    `${freeagentConfig.baseURL}tasks?project=${encodeURIComponent(projectId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  return response.data
}

interface Timeslip {
  taskID: string
  projectID: string
  userID: string
  hours: number
  dated_on: Date
  comment: string
}

async function createFreeAgentTimeslip(token: string, timeslipData: Timeslip) {
  const response = await axios.post(
    `${freeagentConfig.baseURL}timeslips`,
    {
      user: `${freeagentConfig.baseURL}users/${timeslipData.userID}`,
      task: `${freeagentConfig.baseURL}tasks/${timeslipData.taskID}`,
      project: `${freeagentConfig.baseURL}projects/${timeslipData.projectID}`,
      hours: `${timeslipData.hours}`,
      dated_on: `${timeslipData.dated_on.getFullYear()}-${
        timeslipData.dated_on.getMonth() + 1
      }-${timeslipData.dated_on.getDate()}`,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )
}

yargs.command(
  'export_timeular',
  'export timeularWeek',
  () => {},
  async argv => {
    const token = await signIn(
      process.env.TIMEULAR_API_KEY as string,
      process.env.TIMEULAR_API_SECRET as string
    )
    console.log(token)
    const activities = await listActivities(token)
    //console.log(activities.activities)

    fs.writeFileSync(
      'exports/timeularActivities.json',
      JSON.stringify(activities.activities, null, 2)
    )
  }
)

yargs.command(
  'authorise_freeagent',
  'Authorise the app through Oauth on free agent',
  () => {},
  async argv => {
    const freeagentToken = await connectFreeAgent()
    fs.writeFileSync(
      'exports/freeagentToken.json',
      JSON.stringify(freeagentToken, null, 2)
    )
  }
)

yargs.command(
  'freeagent_login',
  'login to Free Agent',
  () => {},
  async argv => {
    const token = await checkFreeAgentToken()
    console.log(token)
  }
)

yargs.command(
  'get_freeagent_projects',
  'download all the projects from freeagent',
  () => {},
  async argv => {
    const freeagentToken = await checkFreeAgentToken()
  }
)

import cliSelect from 'cli-select'

interface Activity {
  id: string
  name: string
  color: string
  integration: string
  spaceId: string
}

interface Entry {
  id: string
  activityId: string
  duration: {
    startedAt: string
    stoppedAt: string
  }
  note: {
    text: string | null
    tags: string[]
    mentions: string[]
  }
}

interface Contact {
  url: string
  organisation_name: string | undefined
  active_projects_count: number
  created_at: string
  updated_at: string
}

interface ContactProject {
  url: string
  name: string
  contact: string
  contact_name: string
  currency: string
  created_at: string
  updated_at: string
}

interface Task {
  url: string
  project: string
  name: string
  is_billable: boolean
  status: string
  created_at: string
  updated_at: string
}

interface SelectType {
  id: number
  value: string
}

yargs.command(
  'start',
  'Creates time',
  () => {},
  async argv => {
    console.log('For which week do you want to save the time slips?')
    const week = await cliSelect({ values: ['Current Week', 'Last Week'] })

    const CORRESPONDANCE_PATH = 'exports/matching.json'

    let projectMatching: {
      [key: string]: {
        taskID: string
        projectID: string
      }
    } = {}
    if (fs.existsSync(CORRESPONDANCE_PATH)) {
      projectMatching = JSON.parse(
        fs.readFileSync(CORRESPONDANCE_PATH).toString()
      )
    }

    const token = await signIn(
      process.env.TIMEULAR_API_KEY as string,
      process.env.TIMEULAR_API_SECRET as string
    )

    const activities: Activity[] = (await listActivities(token)).activities

    let entries: Entry[] = []
    if (week.value === 'Current Week') {
      entries = (await weeklyEntries(token)).timeEntries
    }
    if (week.value === 'Last Week') {
      entries = (await previousWeekEntries(token)).timeEntries
    }

    const projectList: Activity[] = entries.reduce(
      (acc: Activity[], entry: Entry) => {
        const inList = acc.find((ac: Activity) => ac.id === entry.activityId)
        if (inList) {
          return acc
        }

        const activity = activities.find(ac => ac.id === entry.activityId)
        if (activity) {
          acc.push(activity)
        }
        return acc
      },
      []
    )

    while (projectList.length > 0) {
      console.log(
        `\nYou worked on ${projectList.length} this week. Which one do you want to transfer to FreeAgent?\n`
      )
      const activity = await cliSelect({
        values: projectList.map(p => p.name),
      })
      const selectedActivity = projectList[Number(activity.id)]
      const activityEntries = entries.filter(
        e => e.activityId === selectedActivity.id
      )

      const freeAgentToken = await checkFreeAgentToken()

      console.log(`\nFor which client was that?\n`)

      const NEXT = '>>>> Next Page'
      const PREVIOUS = '<<<< Previous Page'

      let contactValue = NEXT

      const contacts: Contact[] = (
        await listFreeAgentContacts(freeAgentToken.access_token)
      ).contacts.filter((c: any) => c.organisation_name)

      let page = 0
      const size = 15
      while (contactValue === NEXT || contactValue === PREVIOUS) {
        const max =
          (page + 1) * size > contacts.length
            ? contacts.length
            : (page + 1) * size
        const contactsSubset = contacts
          .slice(page * size, max)
          .map((c: any) => c.organisation_name)

        if (page !== 0) {
          contactsSubset.unshift(PREVIOUS)
        }
        if (max !== contacts.length) {
          contactsSubset.push(NEXT)
        }
        contactValue = (
          await cliSelect<string>({
            values: contactsSubset,
          })
        ).value

        if (contactValue === PREVIOUS) {
          page = page - 1
        }

        if (contactValue === NEXT) {
          page = page + 1
        }
      }

      const selectedContact: Contact = contacts.find(
        c => c.organisation_name === contactValue
      ) as Contact

      const contactID = selectedContact.url

      const contactProjects: ContactProject[] = (
        await listFreeAgentContactProjects(
          freeAgentToken.access_token,
          contactID
        )
      ).projects

      console.log('Which Projects was that?')
      const project = await cliSelect({
        values: contactProjects.map(p => p.name),
      })
      const selectedProject = contactProjects[Number(project.id)]
      const projectID = selectedProject.url
      console.log(selectedProject)

      const projectTasks: Task[] = (
        await listProjectTasks(freeAgentToken.access_token, projectID)
      ).tasks
      console.log(`Which task did you accoumplish?`)
      const task = await cliSelect({
        values: projectTasks.map(t => t.name),
      })
      const selectedTask = projectTasks[Number(task.id)]
      const taskID = selectedTask.url

      const user = (await getFreeAgentUSer(freeAgentToken.access_token)).user
      const userID = user.url

      projectMatching[selectedActivity.id] = {
        projectID,
        taskID,
      }

      fs.writeFileSync(
        CORRESPONDANCE_PATH,
        JSON.stringify(projectMatching, null, 2)
      )

      for (const entry of activityEntries) {
        const hours =
          (new Date(entry.duration.stoppedAt).getTime() -
            new Date(entry.duration.startedAt).getTime()) /
          (1000 * 60 * 60)
        const dated_on = new Date(entry.duration.startedAt)
        const timeslip: Timeslip = {
          userID,
          taskID,
          projectID,
          hours,
          dated_on,
          comment: entry.note.text || '',
        }

        createFreeAgentTimeslip(freeAgentToken.access_token, timeslip)
      }

      projectList.splice(Number(activity.id), 1)
    }
  }
)

yargs.argv
