// Shared golden benchmark texts (10 subjects) for the opt-in live eval suite.
// Each text is ≥100 chars to satisfy GenerateQuizInputSchema.
export const goldenTexts = [
  {
    subject: 'Medical · Cardiology',
    text: 'The human heart is a four-chambered pump. Blood enters the right atrium from the body, moves to the right ventricle, and is pumped to the lungs for oxygenation. Oxygen-rich blood returns to the left atrium, flows into the left ventricle, and is distributed to the entire body through the aorta. The sinoatrial node acts as the natural pacemaker, generating electrical impulses that coordinate contractions. Hypertension, or high blood pressure, forces the heart to work harder and is a leading risk factor for heart attacks and stroke.',
  },
  {
    subject: 'Law · Contracts',
    text: 'A contract is a legally binding agreement between two or more parties. For a contract to be enforceable, it must contain an offer, an acceptance, and consideration — something of value exchanged between the parties. An offer is a clear statement of terms; acceptance can be express or implied by conduct. Consideration need not be fair, but it must exist. Contracts involving minors, fraud, or illegal subject matter are generally void or voidable. A breach occurs when a party fails to perform their contractual duties, giving the other party a right to damages.',
  },
  {
    subject: 'Computer Science · Operating Systems',
    text: 'An operating system manages hardware resources and provides services to applications. The scheduler decides which process runs on the CPU at any moment, using algorithms like round-robin or priority scheduling. Virtual memory allows programs to use more memory than physically installed by swapping pages between RAM and disk. Processes communicate through pipes, message queues, and shared memory. Deadlock occurs when two or more processes wait indefinitely for resources each other holds, and it can be prevented by ensuring circular wait cannot occur.',
  },
  {
    subject: 'History · The French Revolution',
    text: 'The French Revolution began in 1789 with the storming of the Bastille, a symbol of royal authority. Economic crisis, widespread famine, and Enlightenment ideas fueled popular unrest. The Declaration of the Rights of Man proclaimed liberty, equality, and fraternity as universal rights. King Louis XVI was executed in 1793, and the Reign of Terror under Robespierre followed, executing thousands of suspected enemies of the revolution. The revolution ended with Napoleon Bonaparte seizing power in 1799, spreading revolutionary ideals across Europe through his military campaigns.',
  },
  {
    subject: 'Physics · Electromagnetism',
    text: 'Electric charge comes in two types: positive and negative. Like charges repel while opposite charges attract, a force described by Coulomb\u2019s law. Moving charges create magnetic fields, and changing magnetic fields induce electric currents, a phenomenon called electromagnetic induction discovered by Faraday. Maxwell unified electricity and magnetism into four equations that show light is an electromagnetic wave. Ohm\u2019s law states voltage equals current times resistance. Capacitors store energy in electric fields, while inductors store energy in magnetic fields.',
  },
  {
    subject: 'Literature · Modernist Poetry',
    text: 'Modernist poetry of the early twentieth century broke with Victorian traditions. T.S. Eliot\u2019s \u201cThe Waste Land\u201d weaves fragments of myth, scripture, and everyday speech into a meditation on cultural decay. Ezra Pound championed imagism, demanding direct treatment of the thing, no unnecessary words, and the rhythm of the musical phrase. Free verse replaced strict meter, and allusion became a central technique. Poets explored alienation, fragmented identity, and the collapse of traditional belief systems after the First World War.',
  },
  {
    subject: 'Biology · Photosynthesis',
    text: 'Photosynthesis converts light energy into chemical energy stored in glucose. It occurs in chloroplasts, which contain the green pigment chlorophyll. The light-dependent reactions take place in the thylakoid membranes, splitting water and producing ATP and NADPH. The Calvin cycle, occurring in the stroma, uses these molecules to fix carbon dioxide into glucose. C3 plants fix carbon directly, while C4 and CAM plants have adaptations that reduce water loss and photorespiration in hot, dry environments.',
  },
  {
    subject: 'Economics · Supply and Demand',
    text: 'In a market economy, prices are determined by supply and demand. The demand curve shows how much consumers want at each price, typically sloping downward: lower prices increase quantity demanded. The supply curve slopes upward, as producers supply more at higher prices. Equilibrium occurs where the curves intersect. A surplus forms when price is above equilibrium, pushing prices down; a shortage forms below equilibrium, pushing prices up. Elasticity measures how strongly quantity responds to price changes.',
  },
  {
    subject: 'Psychology · Memory',
    text: 'Memory is divided into sensory, short-term, and long-term storage. Sensory memory holds information for under a second. Short-term memory, also called working memory, can hold roughly seven items for about twenty seconds. The hippocampus is critical for converting short-term memories into long-term ones. Memories are consolidated during sleep, which is why sleep deprivation impairs learning. Retrieval is easier with cues and context — the encoding specificity principle states we recall best when retrieval conditions match encoding conditions.',
  },
  {
    subject: 'Geography · Plate Tectonics',
    text: 'The Earth\u2019s lithosphere is broken into tectonic plates that float on the semi-molten asthenosphere. Plates move apart at divergent boundaries, creating mid-ocean ridges and rift valleys. At convergent boundaries, plates collide, building mountain ranges or subducting, which generates volcanoes and deep ocean trenches. Transform boundaries slide past each other, producing earthquakes along faults like the San Andreas. Continental drift was first proposed by Wegener, but the mechanism was only understood decades later with the discovery of seafloor spreading.',
  },
];
