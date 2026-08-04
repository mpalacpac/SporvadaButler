import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('view-map')
        .setDescription('View regional map statistics, nation territories, and rendered grid chart.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: 0 });

        const guildId = interaction.guild.id;

        try {
            if (!db.initialized) {
                await db.initialize();
            }

            if (!db.isAvailable() || typeof db.db?.pool?.query !== 'function') {
                return interaction.editReply({ content: '❌ PostgreSQL database pool is not available.' });
            }

            const configResult = await db.db.pool.query('SELECT * FROM map_configs WHERE guild_id = $1', [guildId]);
            if (configResult.rows.length === 0) {
                return interaction.editReply({ content: '❌ The regional map has not been initialized yet. Run `/map-setup` first.' });
            }

            const mapConfig = configResult.rows[0];

            // Fetch all claimed sectors and joined nations
            const sectorsResult = await db.db.pool.query(`
                SELECT s.sector_code, s.terrain_type, n.nation_name 
                FROM map_sectors s 
                LEFT JOIN map_nations n ON s.owner_nation_id = n.id 
                WHERE s.guild_id = $1
            `, [guildId]);

            const nationsResult = await db.db.pool.query(`
                SELECT n.nation_name, COUNT(s.sector_code) as claimed_sectors 
                FROM map_nations n 
                LEFT JOIN map_sectors s ON n.id = s.owner_nation_id 
                WHERE n.guild_id = $1 
                GROUP BY n.id, n.nation_name
                ORDER BY claimed_sectors DESC
            `, [guildId]);

            // Map exact database sector codes (case-insensitive trim support)
            const claimedMap = new Map();
            sectorsResult.rows.forEach(sec => {
                const cleanCode = sec.sector_code.trim().toUpperCase();
                const symbol = sec.terrain_type === 'ocean' ? '🟦' : '🟩';
                claimedMap.set(cleanCode, symbol);
            });

            // Render a clear 10x10 preview matrix
            const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
            let gridVisual = '```text\n     1  2  3  4  5  6  7  8  9  10\n';
            
            for (const letter of letters) {
                gridVisual += `${letter}  `;
                for (let i = 1; i <= 10; i++) {
                    const code = `${letter}-${i}`;
                    if (claimedMap.has(code)) {
                        gridVisual += ` ${claimedMap.get(code)}`;
                    } else {
                        gridVisual += ' ⬛';
                    }
                }
                gridVisual += '\n';
            }
            gridVisual += '```';

            let nationsList = 'No nations registered yet.';
            if (nationsResult.rows.length > 0) {
                nationsList = nationsResult.rows
                    .map(n => `• **${n.nation_name}**: ${n.claimed_sectors} micro-sector(s)`)
                    .join('\n');
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`🗺️ Regional Map: ${mapConfig.map_name}`)
                .setDescription('Visual micro-sector matrix preview (🟩 Land, 🟦 Ocean, ⬛ Wilderness):')
                .addFields(
                    { name: 'Grid Preview Matrix', value: gridVisual, inline: false },
                    { name: 'Canvas & Resolution', value: `${mapConfig.width_pixels}px × ${mapConfig.height_pixels}px (${mapConfig.grid_resolution}x grid)`, inline: true },
                    { name: 'Registered Powers', value: nationsList, inline: false }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error rendering visual map view:', error);
            return interaction.editReply({ content: '❌ An error occurred while generating the visual map overview.' });
        }
    },
};