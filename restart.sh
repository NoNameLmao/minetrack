#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BYellow='\033[1;33m'
NC='\033[0m'
# assuming you have pm2 installed!!!
quit() {
    if [[ $1 -eq 1 ]]
    then
        echo -e "${BYellow}{RESTART} ${RED}Exiting due to error...${NC}"
        exit 1
    else
        echo -e "${BYellow}{RESTART}${GREEN} Restart successful, exiting...${NC}"
        exit $1
    fi
}
echo -e "${BYellow}{RESTART} ${CYAN}Stopping minetrack...${NC}"
pm2 stop minetrack
if [[ $? -eq 1 ]]
    then
        echo -e "${BYellow}{RESTART} ${CYAN}Recieved ${RED}exit code 1${CYAN}, either pm2 is not installed or it cannot find minetrack.${NC}"
        quit 1
    fi
echo -e "${BYellow}{RESTART} ${CYAN}Pulling commits from github repo...${NC}"
git pull
echo -e "${BYellow}{RESTART} ${CYAN}Resetting database...${NC}"
rm -rf database.sql database.sql-journal
echo -e "${BYellow}{RESTART} ${CYAN}Starting minetrack...${NC}"
pm2 start minetrack
quit 0