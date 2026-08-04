import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('claim-territory')
        .setDescription('Automatically claim a procedurally generated, organically-shaped territory region.')
        .addStringOption(option =>
            option.setName('nation_name')
                .setDescription('Your NationStates nation name')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('total_sectors')
                .setDescription('Total number of micro-sectors to claim (e.g., 20 to 100)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('terrain_style')
                .setDescription('Choose regional geography style')
                .setRequired(true)
                .addChoices(
                    { name: 'Pure Land (Inland)', value: 'land_locked' },
                    { name: 'Coastal (Land with Ocean border)', value: 'coastal' },
                    { name: 'Archipelago (Island chain)', value: 'archipelago' }
                )),

    async execute(interaction) {
        await interaction.deferReply({ flags: 0 });

        const guildId = interaction.guild.id;
        const nationName = interaction.options.getString('nation_name');
        const targetCount = interaction.options.getInteger('total_sectors');
        const terrainStyle = interaction.options.getString('terrain_style');

        if (targetCount < 5 || targetCount > 200) {
            return interaction.editReply({ content: '❌ Please choose a total sector count between **5 and 200** for performance safety.' });
        }

        try {
            if (!db.initialized) {
                await db.initialize();
            }

            if (!db.isAvailable() || typeof db.db?.pool?.query !== 'function') {
                return interaction.editReply({ content: '❌ PostgreSQL database pool is not available.' });
            }

            // Ensure map configuration exists
            const configCheck = await db.db.pool.query('SELECT * FROM map_configs WHERE guild_id = $1', [guildId]);
            if (configCheck.rows.length === 0) {
                return interaction.editReply({ content: '❌ The regional map has not been initialized yet. Run `/map-setup` first.' });
            }

            // Get or create nation entry
            let nationQuery = await db.db.pool.query(
                'SELECT id FROM map_nations WHERE guild_id = $1 AND LOWER(nation_name) = LOWER($2)',
                [guildId, nationName]
            );

            let nationId;
            if (nationQuery.rows.length > 0) {
                nationId = nationQuery.rows[0].id;
            } else {
                const insertNation = await db.db.pool.query(
                    'INSERT INTO map_nations (guild_id, nation_name, owner_discord_id) VALUES ($1, $2, $3) RETURNING id',
                    [guildId, nationName, interaction.user.id]
                );
                nationId = insertNation.rows[0].id;
            }

            // Procedural Organic Growth Algorithm (Random Walk / Cellular Expansion)
            const claimedSectors = new Set();
            const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
            
            // Pick a random starting anchor code
            let startRowLetter = letters[Math.floor(Math.random() * letters.length)];
            let startColNum = Math.floor(Math.random() * 40) + 1;
            
            let activeCells = [`${startRowLetter}-${startColNum}`];
            claimedSectors.add(activeCells[0]);

            while (claimedSectors.size < targetCount && activeCells.length > 0) {
                // Pick a random existing cell to expand from
                const randomIndex = Math.floor(Math.random() * activeCells.length);
                const currentCell = activeCells[randomIndex];
                const [rLetter, cNumStr] = currentCell.split('-');
                let cNum = parseInt(cNumStr);

                // Possible directions: North, South, East, West
                const directions = [
                    { l: String.fromCharCode(rLetter.charCodeAt(0) - 1), c: cNum },
                    { l: String.fromCharCode(rLetter.charCodeAt(0) + 1), c: cNum },
                    { l: rLetter, c: cNum + 1 },
                    { l: rLetter, c: cNum - 1 }
                ];

                const validDirs = directions.filter(d => d.l >= 'A' && d.l <= 'J' && d.c >= 1 && d.c <= 60);
                if (validDirs.length === 0) {
                    activeCells.splice(randomIndex, 1);
                    continue;
                }

                const chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
                const newCode = `${chosen.l}-${chosen.c}`;

                if (!claimedSectors.has(newCode)) {
                    claimedSectors.add(newCode);
                    activeCells.push(newCode);
                } else if (Math.random() > 0.6) {
                    // Prune dead-end cells to keep shape organic
                    activeCells.splice(randomIndex, 1);
                }
            }

            // Insert generated sectors into the database
            let landAssignedCount = 0;
            let oceanAssignedCount = 0;

            for (const sectorCode of claimedSectors) {
                let terrain = 'land';
                let currentNationId = nationId;

                if (terrainStyle === 'coastal') {
                    // Make outer edges ocean
                    const parts = sectorCode.split('-');
                    if (parseInt(parts[1]) % 4 === 0) {
                        terrain = 'ocean';
                        currentNationId = null;
                        oceanAssignedCount++;
                    } else {
                        landAssignedCount++;
                    }
                } else if (terrainStyle === 'archipelago') {
                    // Mix of scattered sea
                    if (Math.random() > 0.65) {
                        terrain = 'ocean';
                        currentNationId = null;
                        oceanAssignedCount++;
                    } else {
                        landAssignedCount++;
                    }
                } else {
                    landAssignedCount++;
                }

                const sectorUpsert = `
                    INSERT INTO map_sectors (guild_id, sector_code, coord_x, coord_y, terrain_type, owner_nation_id)
                    VALUES ($1, $2, 0, 0, $3, $4)
                    ON CONFLICT (guild_id, sector_code)
                    DO UPDATE SET terrain_type = EXCLUDED.terrain_type, 
                                  owner_nation_id = EXCLUDED.owner_nation_id;
                `;
                await db.db.pool.query(sectorUpsert, [guildId, sectorCode, terrain, currentNationId]);
            }

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle(`🗺️ Territory Generated: ${nationName}`)
                .setDescription(`Successfully claimed an organic territorial cluster of **${claimedSectors.size}** micro-sectors!`)
                .addFields(
                    { name: 'Geography Style', value: terrainStyle.replace('_', ' ').toUpperCase(), inline: true },
                    { name: '🟩 Land Claimed', value: `${landAssignedCount} sectors`, inline: true },
                    { name: '🟦 Ocean / Waters', value: `${oceanAssignedCount} sectors`, inline: true },
                    { name: 'Sample Core Sector', value: `\`${Array.from(claimedSectors)[0]}\``, inline: false }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error generating bulk territory:', error);
            return interaction.editReply({ content: '❌ An error occurred while generating and claiming the territory region.' });
        }
    },
};