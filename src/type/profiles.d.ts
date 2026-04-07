export interface Profile {
  id: string
  name: string
  createdAt: number
}

export interface ProfilesConfig {
  activeProfileId: string
  profiles: Profile[]
}

export interface ProfilesAPI {
  list: () => Promise<Profile[]>
  getActive: () => Promise<Profile>
  create: (name: string) => Promise<Profile>
  rename: (id: string, name: string) => Promise<Profile>
  delete: (id: string) => Promise<boolean>
  switch: (id: string) => Promise<void>
}

declare global {
  interface Window {
    profiles: ProfilesAPI
  }
}
