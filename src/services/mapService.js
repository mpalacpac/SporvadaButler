-- Tracks map configurations per Discord server (guild)
CREATE TABLE map_configs (
    guild_id VARCHAR(32) PRIMARY KEY,
    map_name VARCHAR(100) DEFAULT 'Custom Region',
    width_pixels INT NOT NULL,
    height_pixels INT NOT NULL,
    grid_resolution INT DEFAULT 100 -- e.g., 100x100 micro-sectors
);

-- Tracks individual micro-sectors for land, ocean, and territory control
CREATE TABLE map_sectors (
    guild_id VARCHAR(32) NOT NULL,
    sector_code VARCHAR(20) NOT NULL, -- e.g., "A-01"
    coord_x INT NOT NULL,
    coord_y INT NOT NULL,
    terrain_type VARCHAR(10) DEFAULT 'land', -- 'land' or 'ocean'
    owner_nation_id INT DEFAULT NULL,
    PRIMARY KEY (guild_id, sector_code)
);

-- Tracks nation profiles and their capitals
map_nations (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    nation_name VARCHAR(100) NOT NULL,
    owner_discord_id VARCHAR(32) NOT NULL,
    capital_sector VARCHAR(20)
);