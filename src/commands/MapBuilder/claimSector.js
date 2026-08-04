import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { pool } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('claim-sector')
        .setDescription('Claim a specific micro-sector for your nation or set it as ocean.')
        .addStringOption(option =>
            option.setName('sector_code')
                .setDescription('The sector code to claim (e.g., A-42)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('terrain_type')
                .setDescription('Choose terrain type: land or ocean')
                .setRequired(true)
                .addChoices(
                    { name: 'Land (Claimable)', value: 'land' },
                    { name: 'Ocean / Water', value: 'ocean' }
                ))
        .addStringOption(option =>
            option.setName('nation_name')
                .setDescription('Your NationStates nation name (leave blank if setting as ocean)')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const guildId = interaction.guild.id;
        const sectorCode = interaction.options.getString('sector_code').toUpperCase();
        const terrainType = interaction.options.getString('terrain_type');
        const nationName = interaction.options.getString('nation_name');

        try {
            const configCheck = await pool.query('SELECT * FROM map_configs WHERE guild_id = $1', [guildId]);
            if (configCheck.rows.length === 0) {
                return interaction.editReply({ content: '❌ The regional map has not been initialized yet. Run `/map-setup` first.' });
            }

            let nationId = null;

            if (terrainType === 'land') {
                if (!nationName) {
                    return interaction.editReply({ content: '❌ You must specify your `nation_name` when claiming a land sector.' });
                }

                let nationQuery = await pool.query(
                    'SELECT id FROM map_nations WHERE guild_id = $1 AND LOWER(nation_name) = LOWER($2)',
                    [guildId, nationName]
                );

                if (nationQuery.rows.length > 0) {
                    nationId = nationQuery.rows[0].id;
                } else {
                    const insertNation = await pool.query(
                        'INSERT INTO map_nations (guild_id, nation_name, owner_discord_id) VALUES ($1, $2, $3) RETURNING id',
                        [guildId, nationName, interaction.user.id]
                    );
                    nationId = insertNation.rows[0].id;
                }
            }

            const sectorUpsert = `
                INSERT INTO map_sectors (guild_id, sector_code, coord_x, coord_y, terrain_type, owner_nation_id)
                VALUES ($1, $2, 0, 0, $3, $4)
                ON CONFLICT (guild_id, sector_code)
                DO UPDATE SET terrain_type = EXCLUDED.terrain_type, 
                              owner_nation_id = EXCLUDED.owner_nation_id;
            `;
            await pool.query(sectorUpsert, [guildId, sectorCode, terrainType, nationId]);

            const embed = new EmbedBuilder()
                .setColor(terrainType === 'ocean' ? '#1e90ff' : '#2ecc71')
                .setTitle('🗺️ Sector Updated')
                .setDescription(`Sector **${sectorCode}** has been successfully updated.`)
                .addFields(
                    { name: 'Terrain Type', value: terrainType.toUpperCase(), inline: true },
                    { name: 'Controlled By', value: nationName ? nationName : 'None (Open Ocean/Wilderness)', inline: true }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error claiming sector:', error);
            return interaction.editReply({ content: '❌ An error occurred while updating the sector in the database.' });
        }
    },
};