<?php
// Copy this file to config.php and fill in the real values from cPanel.
// config.php is gitignored so credentials never reach the repo.

return [
    'db_host' => 'localhost',
    'db_name' => 'PREFIX_songsmith',   // full name incl. cPanel prefix, e.g. hassaall_songsmith
    'db_user' => 'PREFIX_songsmith',   // full username incl. prefix
    'db_pass' => 'YOUR_DB_PASSWORD',
    'db_charset' => 'utf8mb4',
];
