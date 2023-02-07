# assuming you have pm2 installed!!!
echo "Stopping minetrack..."
pm2 stop minetrack
echo "Pulling commits from github repo..."
git pull
echo "Resetting database..."
rm -rf database.sql database.sql-journal
echo "Starting minetrack..."
pm2 start minetrack
echo "done, might take a while to start up tho lol just be patient"