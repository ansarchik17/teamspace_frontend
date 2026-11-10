import { Room, createLocalAudioTrack } from 'livekit-client'

let room: Room | null = null
Object.assign(window, {
  runMeetingAudio: async (session: { livekit_url: string; participant_token: string }) => {
    room = new Room()
    await room.connect(session.livekit_url, session.participant_token)
    const audio = await createLocalAudioTrack({ echoCancellation: false, noiseSuppression: false, autoGainControl: false })
    await room.localParticipant.publishTrack(audio)
    return { connected: true }
  },
  stopMeetingAudio: async () => { await room?.disconnect() },
})
