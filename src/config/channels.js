// User-editable channel list. Edit freely — nothing else depends on the shape beyond
// { name, desc, flag, url } inside each group's `channels` array.
//
// Link status at build time (2026-08-10):
//   VERIFIED  = handle confirmed live
//   SEARCH    = handle could not be confirmed; link goes to a YouTube search that
//               always resolves — replace with the real handle when you find it
//   SWAPPED   = the spec's "Español con Samuel" could not be found on YouTube;
//               replaced with Easy Spanish (CDMX street interviews, same slot)
export const CHANNEL_GROUPS = [
  {
    group: "Beginner — comprehensible input",
    channels: [
      {
        name: "Dreaming Spanish",
        desc: "The core input source — filter to Mexico in platform settings.",
        flag: "🇲🇽🇪🇸",
        url: "https://www.dreamingspanish.com", // VERIFIED
      },
      {
        name: "How to Spanish",
        desc: "Mexican couple, slow clear conversation.",
        flag: "🇲🇽",
        url: "https://www.youtube.com/@HowtoSpanishOfficial",
      },
      {
        name: "Easy Spanish",
        desc: "CDMX street interviews with subtitles, beginner-friendly.",
        flag: "🇲🇽",
        url: "https://www.youtube.com/@EasySpanish", // SWAPPED (see note above)
      },
    ],
  },
  {
    group: "Intermediate",
    channels: [
      {
        name: "No Hay Tos",
        desc: "Mexican podcast, natural speed, slang-heavy.",
        flag: "🇲🇽",
        url: "https://www.youtube.com/results?search_query=no+hay+tos+podcast", // SEARCH
      },
      {
        name: "Chill Spanish Listening Practice",
        desc: "Slow monologue format, everyday topics.",
        flag: "🌎",
        url: "https://www.youtube.com/@chillspanishlisteningpract100", // VERIFIED
      },
      {
        name: "¡Cuéntame!",
        desc: "Storytelling with comprehensible input, intermediate pacing.",
        flag: "🌎",
        url: "https://www.youtube.com/results?search_query=cuentame+comprehensible+input+spanish", // SEARCH
      },
    ],
  },
  {
    group: "Advanced — native content",
    channels: [
      {
        name: "Luisito Comunica",
        desc: "Travel vlogs, fast colloquial Mexican.",
        flag: "🇲🇽",
        url: "https://www.youtube.com/@LuisitoComunica", // VERIFIED
      },
      {
        name: "Creativo",
        desc: "Roberto Martínez's long-form interview podcast.",
        flag: "🇲🇽",
        url: "https://www.youtube.com/results?search_query=creativo+roberto+martinez+podcast", // SEARCH
      },
      {
        name: "La Cotorrisa",
        desc: "Comedy podcast — the hardest listening target here.",
        flag: "🇲🇽",
        url: "https://www.youtube.com/@LaCotorrisa", // VERIFIED
      },
    ],
  },
];
